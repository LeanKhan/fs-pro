package grid

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the grid.* routes: the club's stored layouts, their
// server-authoritative validation, and the publish/import share-code loop
// (docs/coc-mapping/05 §3, 03 §1.7-1.9). The club-param routes are owner-scoped
// by the route policy table; the share-code import (a SignedIn rule) is scoped
// here to a club the caller actually manages.
type Handlers struct {
	svc   *Service
	clubs ClubReader
	own   Ownership
}

// New builds the handler set.
func New(svc *Service, clubs ClubReader, own Ownership) *Handlers {
	return &Handlers{svc: svc, clubs: clubs, own: own}
}

// sessionUserID reads the signed-in user id from the request context.
func sessionUserID(cx *httpapi.Context) string {
	if cx != nil && cx.Session != nil {
		return cx.Session.UserID()
	}
	return ""
}

// gridBody is the put/validate request: the pitch grid the client drew.
type gridBody struct {
	Grid *Grid `json:"grid"`
}

// importBody is the import request.
type importBody struct {
	Code   string `json:"code"`
	ClubID string `json:"clubId"`
	Slot   string `json:"slot"`
}

// getLayouts is GET /api/clubs/{id}/layouts: every stored slot plus the tier
// that gates them.
func (h *Handlers) getLayouts(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	profile, ok, err := h.clubs.Profile(ctx, r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	layouts, err := h.svc.Layouts(ctx, profile.ID)
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	return httpapi.OK("Layouts", map[string]any{"layouts": layouts, "tier": profile.ClubhouseTier})
}

// getLayout is GET /api/clubs/{id}/layouts/{slot}.
func (h *Handlers) getLayout(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	slot, ok := parseSlot(r.PathValue("slot"))
	if !ok {
		return httpapi.Fail(400, unknownSlotMessage(r.PathValue("slot")), nil)
	}
	profile, found, err := h.clubs.Profile(ctx, r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	if !found {
		return httpapi.Fail(404, "Club not found", nil)
	}
	layouts, err := h.svc.Layouts(ctx, profile.ID)
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	g, present := layouts.Grid(slot)
	if !present || len(g.Slots) == 0 {
		return httpapi.Fail(404, "No layout saved in that slot", nil)
	}
	return httpapi.OK("Layout", map[string]any{"slot": slot, "grid": g, "tier": profile.ClubhouseTier})
}

// putLayout is PUT /api/clubs/{id}/layouts/{slot}.
func (h *Handlers) putLayout(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	slot, ok := parseSlot(r.PathValue("slot"))
	if !ok {
		return httpapi.Fail(400, unknownSlotMessage(r.PathValue("slot")), nil)
	}
	g, verr := decodeBodyGrid(cx)
	if verr != "" {
		return httpapi.Fail(400, verr, nil)
	}
	profile, found, err := h.clubs.Profile(ctx, r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	if !found {
		return httpapi.Fail(404, "Club not found", nil)
	}
	if err := h.svc.SaveLayout(ctx, profile.ID, slot, *g, profile.ClubhouseTier); err != nil {
		return layoutFail(err)
	}
	return httpapi.OK("Layout saved", map[string]any{"slot": slot, "grid": *g, "tier": profile.ClubhouseTier})
}

// validateLayout is POST /api/clubs/{id}/layouts/validate: the authoritative
// verdict plus the advisory preview, without persisting anything.
func (h *Handlers) validateLayout(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	g, verr := decodeBodyGrid(cx)
	if verr != "" {
		return httpapi.Fail(400, verr, nil)
	}
	profile, found, err := h.clubs.Profile(ctx, r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	if !found {
		return httpapi.Fail(404, "Club not found", nil)
	}
	reason := Validate(*g, profile.ClubhouseTier)
	var reasonOut any
	if reason != "" {
		reasonOut = reason
	}
	return httpapi.OK("Layout checked", map[string]any{
		"valid":   reason == "",
		"reason":  reasonOut,
		"tier":    profile.ClubhouseTier,
		"preview": BuildPreview(*g),
	})
}

// publishLayout is POST /api/clubs/{id}/layouts/{slot}/publish.
func (h *Handlers) publishLayout(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	slot, ok := parseSlot(r.PathValue("slot"))
	if !ok {
		return httpapi.Fail(400, unknownSlotMessage(r.PathValue("slot")), nil)
	}
	profile, found, err := h.clubs.Profile(ctx, r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	if !found {
		return httpapi.Fail(404, "Club not found", nil)
	}
	pub, err := h.svc.PublishLayout(ctx, profile.ID, slot)
	if err != nil {
		return layoutFail(err)
	}
	return httpapi.OK("Layout published", map[string]any{
		"code": pub.Code, "slot": pub.Slot, "clubId": pub.ClubID,
	})
}

// importLayout is POST /api/layouts/import: clone a published layout into the
// caller's slot (the target club comes from the body; the route policy enforces
// that the caller owns it).
func (h *Handlers) importLayout(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	var body importBody
	if raw := cx.BodyBytes(); len(raw) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			return httpapi.Fail(400, "Invalid import request", nil)
		}
	}
	if !ValidShareCode(body.Code) {
		return httpapi.Fail(400, "That layout code is not valid", nil)
	}
	slot, ok := parseSlot(body.Slot)
	if !ok {
		return httpapi.Fail(400, unknownSlotMessage(body.Slot), nil)
	}
	// The destination club: the body may name it (then the caller must manage
	// it), otherwise it is the caller's club. This keeps the import scoped to a
	// club the session actually controls under the route's SignedIn policy.
	userID := sessionUserID(cx)
	target := body.ClubID
	switch {
	case target != "" && h.own != nil:
		status, msg := h.own.CanManage(ctx, userID, target)
		if status == 401 {
			return httpapi.Fail(401, msg, nil)
		}
		if status != 0 {
			// 403 (not yours) and 404 (missing) both hide, staying inside the
			// route's declared status set.
			return httpapi.Fail(404, "Club not found", nil)
		}
	case target == "":
		if userID == "" {
			return httpapi.Fail(401, "Not logged in", nil)
		}
		id, found, err := h.clubs.ClubForUser(ctx, userID)
		if err != nil {
			return httpapi.Fail(400, err.Error(), nil)
		}
		if !found {
			return httpapi.Fail(404, "You have no club to import into", nil)
		}
		target = id
	}
	profile, found, err := h.clubs.Profile(ctx, target)
	if err != nil {
		return httpapi.Fail(400, err.Error(), nil)
	}
	if !found {
		return httpapi.Fail(404, "Club not found", nil)
	}
	g, err := h.svc.ImportLayout(ctx, body.Code, profile.ID, slot, profile.ClubhouseTier)
	if err != nil {
		return layoutFail(err)
	}
	return httpapi.OK("Layout imported", map[string]any{"slot": slot, "grid": g, "tier": profile.ClubhouseTier})
}

// layoutFail maps the store/validation errors to an HTTP status, never leaking
// an internal error as a success.
func layoutFail(err error) httpapi.Response {
	var invalid InvalidLayoutError
	switch {
	case errors.As(err, &invalid):
		return httpapi.Fail(400, invalid.Reason, nil)
	case errors.Is(err, ErrNoLayout), errors.Is(err, ErrNoShareCode):
		return httpapi.Fail(404, err.Error(), nil)
	default:
		return httpapi.Fail(400, err.Error(), nil)
	}
}

// decodeBodyGrid parses {"grid": {...}} from the buffered body. It returns a
// human-readable reason when the body or grid is missing/malformed.
func decodeBodyGrid(cx *httpapi.Context) (*Grid, string) {
	raw := cx.BodyBytes()
	if len(raw) == 0 {
		return nil, "A layout is required"
	}
	var body gridBody
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, "Invalid layout request"
	}
	if body.Grid == nil {
		return nil, "A layout is required"
	}
	return body.Grid, ""
}

// parseSlot resolves a path/body slot name.
func parseSlot(s string) (LayoutSlot, bool) {
	slot := LayoutSlot(s)
	return slot, ValidSlot(slot)
}

func unknownSlotMessage(s string) string {
	return fmt.Sprintf("Unknown layout slot %q", s)
}
