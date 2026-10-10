package preseason

import (
	"encoding/json"
	"errors"
	"net/http"

	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/httpapi"
)

// Handlers implements the preseason.* routes (docs/coc-mapping/05 §3, 02 §J,
// 04 §8). The club id is the {clubId} path param and the route-policy table
// enforces owner/admin access (Club rule), so the declared 401/403/404 statuses
// are produced by the guard and the handler produces 200/400/409.
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

// stageField reads the required 1-based stage index, rejecting forged floats.
func stageField(m map[string]any) (int, bool) {
	switch n := m["stage"].(type) {
	case int:
		return n, n >= 1
	case int64:
		return int(n), n >= 1
	case float64:
		if n != float64(int(n)) {
			return 0, false
		}
		return int(n), int(n) >= 1
	default:
		return 0, false
	}
}

// get is GET /api/preseason/{clubId}.
func (h *Handlers) get(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.Build(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Pre-Season Tour", payload)
}

// play is POST /api/preseason/{clubId}/play: resolve a stage against its
// server-owned AI opponent. The body carries the required `stage` plus optional
// `orders`, `layout`, `effects` and `watch` (the P5 raid inputs).
func (h *Handlers) play(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	b := body(cx)
	stage, ok := stageField(b)
	if !ok {
		return httpapi.Fail(400, "stage is required (1-based)", "stage is required (1-based)")
	}
	opts, err := playOptions(b)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	payload, err := h.repo.Play(r.Context(), r.PathValue("clubId"), stage, opts)
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Pre-Season stage played", payload)
}

// claim is POST /api/preseason/{clubId}/claim: grant a cleared stage's reward
// once. The body carries the required `stage`.
func (h *Handlers) claim(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	b := body(cx)
	stage, ok := stageField(b)
	if !ok {
		return httpapi.Fail(400, "stage is required (1-based)", "stage is required (1-based)")
	}
	payload, err := h.repo.Claim(r.Context(), r.PathValue("clubId"), stage)
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK("Pre-Season reward claimed", payload)
}

// playOptions parses the optional raid inputs. The layout is decoded here; the
// repository validates it at the club's Clubhouse tier.
func playOptions(b map[string]any) (PlayOptions, error) {
	opts := PlayOptions{}
	if watch, ok := b["watch"].(bool); ok {
		opts.Watch = watch
	}
	if orders, ok := b["orders"].([]any); ok {
		opts.Orders = orders
	}
	if raw, ok := b["effects"].(map[string]any); ok {
		effects := make(map[string][]any, len(raw))
		for id, v := range raw {
			if list, ok := v.([]any); ok && len(list) > 0 {
				effects[id] = list
			}
		}
		if len(effects) > 0 {
			opts.Effects = effects
		}
	}
	if raw, ok := b["layout"]; ok && raw != nil {
		blob, err := json.Marshal(raw)
		if err != nil {
			return opts, errors.New("That layout could not be read")
		}
		var g grid.Grid
		if err := json.Unmarshal(blob, &g); err != nil {
			return opts, errors.New("That layout could not be read")
		}
		opts.Layout = &g
	}
	return opts, nil
}

// mapErr maps the Pre-Season sentinel errors to the routes' declared statuses.
func mapErr(err error) httpapi.Response {
	msg := err.Error()
	switch {
	case errors.Is(err, ErrClubNotFound):
		return httpapi.Fail(404, msg, msg)
	case errors.Is(err, ErrStageLocked), errors.Is(err, ErrStageNotCleared),
		errors.Is(err, ErrAlreadyClaimed), errors.Is(err, ErrNoSquad):
		return httpapi.Fail(409, msg, msg)
	default:
		return httpapi.Fail(400, msg, msg)
	}
}
