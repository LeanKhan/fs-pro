package campus

import (
	"context"
	"errors"
	"net/http"
	"os"
	"time"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the campus.* routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func body(cx *httpapi.Context) map[string]any {
	m, _ := cx.BodyMap()
	if m == nil {
		return map[string]any{}
	}
	return m
}

func str(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

// intField reads an integer JSON field, reporting false when absent or not
// integral, so a forged float cannot silently truncate a grid coordinate.
func intField(m map[string]any, key string) (int, bool) {
	switch n := m[key].(type) {
	case float64:
		if n != float64(int(n)) {
			return 0, false
		}
		return int(n), true
	case int:
		return n, true
	case int64:
		return int(n), true
	default:
		return 0, false
	}
}

// scale reads GAME_TIME_SCALE once per request (playtest builds compress time).
func scale() float64 {
	return GameTimeScale(os.Getenv("GAME_TIME_SCALE"))
}

func (h *Handlers) campus(ctx context.Context, clubID string, now time.Time) httpapi.Response {
	state, ok, err := h.repo.BuildState(ctx, clubID, now, scale())
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Campus", state)
}

// get is GET /api/campus/{clubId}.
func (h *Handlers) get(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	return h.campus(r.Context(), r.PathValue("clubId"), time.Now().UTC())
}

// upgrade is POST /api/campus/{clubId}/upgrade.
func (h *Handlers) upgrade(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("clubId")
	assetType := str(body(cx), "assetType")
	if assetType == "" {
		return httpapi.Fail(400, "assetType is required", "assetType is required")
	}
	now := time.Now().UTC()
	if err := h.repo.StartUpgrade(r.Context(), clubID, assetType, now, scale()); err != nil {
		return mapErr(err)
	}
	return h.campus(r.Context(), clubID, now)
}

// place is POST /api/campus/{clubId}/place.
func (h *Handlers) place(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("clubId")
	b := body(cx)
	building := str(b, "building")
	x, okX := intField(b, "x")
	z, okZ := intField(b, "z")
	rot, okRot := intField(b, "rot")
	if building == "" || !okX || !okZ || !okRot {
		return httpapi.Fail(400, "building, x, z and rot are required integers", "building, x, z and rot are required integers")
	}
	now := time.Now().UTC()
	found, err := h.repo.Place(r.Context(), clubID, building, x, z, rot, now)
	if err != nil {
		return mapErr(err)
	}
	if !found {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return h.campus(r.Context(), clubID, now)
}

// collect is POST /api/campus/{clubId}/collect.
func (h *Handlers) collect(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("clubId")
	now := time.Now().UTC()
	if _, err := h.repo.Collect(r.Context(), clubID, now, scale()); err != nil {
		return mapErr(err)
	}
	return h.campus(r.Context(), clubID, now)
}

// clearObstacle is POST /api/campus/{clubId}/obstacle/clear.
func (h *Handlers) clearObstacle(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("clubId")
	obstacleID := str(body(cx), "obstacleId")
	if obstacleID == "" {
		return httpapi.Fail(400, "obstacleId is required", "obstacleId is required")
	}
	now := time.Now().UTC()
	if err := h.repo.ClearObstacle(r.Context(), clubID, obstacleID, now); err != nil {
		return mapErr(err)
	}
	return h.campus(r.Context(), clubID, now)
}

// buyGroundskeeper is POST /api/campus/{clubId}/groundskeeper/buy.
func (h *Handlers) buyGroundskeeper(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("clubId")
	now := time.Now().UTC()
	if err := h.repo.BuyGroundskeeper(r.Context(), clubID, now); err != nil {
		return mapErr(err)
	}
	return h.campus(r.Context(), clubID, now)
}

// usePerk is POST /api/campus/{clubId}/perk/use: redeem one quick consumable
// Board Perk (04 §7). The optional instanceId makes a retried request a no-op;
// the optional target names the running upgrade a Construction/Research perk
// finishes (required for those kinds).
func (h *Handlers) usePerk(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("clubId")
	b := body(cx)
	perk := str(b, "perk")
	if perk == "" {
		return httpapi.Fail(400, "perk is required", "perk is required")
	}
	// instanceId must be a non-empty string when present (a numeric/array body
	// value is a client bug, but the repo call validates the recorded key).
	instanceID := ""
	if raw, ok := b["instanceId"]; ok && raw != nil {
		id, ok := raw.(string)
		if !ok || id == "" {
			return httpapi.Fail(400, "instanceId must be a non-empty string", "instanceId must be a non-empty string")
		}
		instanceID = id
	}
	// target names the running upgrade for Construction/Research perks.
	target := ""
	if raw, ok := b["target"]; ok && raw != nil {
		v, ok := raw.(string)
		if !ok || v == "" {
			return httpapi.Fail(400, "target must be a non-empty string", "target must be a non-empty string")
		}
		target = v
	}
	now := time.Now().UTC()
	if _, err := h.repo.UsePerk(r.Context(), clubID, perk, instanceID, target, now); err != nil {
		return mapErr(err)
	}
	return h.campus(r.Context(), clubID, now)
}

// mapErr maps a campus sentinel error to the route's declared status. Every
// status returned here is listed on the route (see router.go).
func mapErr(err error) httpapi.Response {
	msg := err.Error()
	switch {
	case errors.Is(err, ErrClubNotFound), errors.Is(err, ErrObstacleNotFound):
		return httpapi.Fail(404, msg, msg)
	case errors.Is(err, ErrObstacleAlreadyCleared), errors.Is(err, ErrInsufficientFunds),
		errors.Is(err, ErrAllBuildersBusy), errors.Is(err, ErrAlreadyUpgrading),
		errors.Is(err, ErrMaxLevel), errors.Is(err, ErrFacilityCapped),
		errors.Is(err, ErrClubhouseRequirements), errors.Is(err, ErrNothingToCollect),
		errors.Is(err, ErrGroundskeepersMaxed), errors.Is(err, ErrPerkUnavailable),
		errors.Is(err, ErrPerkTargetNotUpgrading):
		return httpapi.Fail(409, msg, msg)
	case errors.Is(err, ErrUnsupportedFacility), errors.Is(err, ErrUnknownBuilding),
		errors.Is(err, ErrInvalidPlacement), errors.Is(err, ErrGroundskeeperEarned),
		errors.Is(err, ErrUnknownPerk), errors.Is(err, ErrPerkTargetRequired),
		errors.Is(err, ErrPerkTargetInvalid):
		return httpapi.Fail(400, msg, msg)
	default:
		return httpapi.Fail(400, msg, msg)
	}
}
