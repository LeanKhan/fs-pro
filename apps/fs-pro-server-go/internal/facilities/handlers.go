package facilities

import (
	"context"
	"math"
	"net/http"
	"strconv"
	"time"

	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// sessionUser reads the signed-in user id from the request context.
func sessionUser(cx *httpapi.Context) string {
	if cx != nil && cx.Session != nil {
		return cx.Session.UserID()
	}
	return ""
}

// Handlers implements the facilities.* routes.
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

// getCampus is GET /api/facilities/{clubId}.
func (h *Handlers) getCampus(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	campus, ok, err := h.campus(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Club facilities", campus)
}

// startUpgrade is POST /api/facilities/{clubId}/upgrade.
func (h *Handlers) startUpgrade(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	if status, msg := auth.CanManageClub(ctx, h.repo.Q(), sessionUser(cx), clubID); status != 0 {
		return httpapi.Fail(status, msg, nil)
	}
	assetType := str(body(cx), "assetType")
	if !IsAssetType(assetType) {
		return httpapi.Fail(400, "Unknown asset type \""+assetType+"\"", "Unknown asset type \""+assetType+"\"")
	}
	if err := h.repo.StartUpgrade(ctx, clubID, AssetType(assetType)); err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	campus, ok, err := h.campus(ctx, clubID)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Upgrade started", campus)
}

// savePlacement is PUT /api/facilities/{clubId}/placement.
func (h *Handlers) savePlacement(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	clubID := r.PathValue("clubId")
	if status, msg := auth.CanManageClub(ctx, h.repo.Q(), sessionUser(cx), clubID); status != 0 {
		return httpapi.Fail(status, msg, nil)
	}
	raw, _ := body(cx)["placement"].(map[string]any)
	placement := parsePlacement(raw)
	if problem := ValidatePlacement(placement); problem != "" {
		return httpapi.Fail(400, problem, problem)
	}
	ok, err := h.repo.SetPlacement(ctx, clubID, placementJSON(placement))
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	campus, _, err := h.campus(ctx, clubID)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	return httpapi.OK("Campus layout saved", campus)
}

// getMedicalStatus is GET /api/facilities/{clubId}/medical (declared stub).
func (h *Handlers) getMedicalStatus(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Medical Centre status is not available in the Go server yet", nil)
}

// squadRecovery is POST /api/facilities/{clubId}/medical/squad-recovery (stub).
func (h *Handlers) squadRecovery(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Squad recovery is not available in the Go server yet", nil)
}

// treatPlayer is POST /api/facilities/{clubId}/medical/treat-player (stub).
func (h *Handlers) treatPlayer(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	return httpapi.Fail(400, "Player treatment is not available in the Go server yet", nil)
}

func (h *Handlers) campus(ctx context.Context, clubID string) (map[string]any, bool, error) {
	club, ok, err := h.repo.Club(ctx, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	if err := h.repo.CompleteDueUpgrades(ctx, time.Now()); err != nil {
		return nil, false, err
	}
	rows, err := h.repo.AssetRows(ctx, clubID)
	if err != nil {
		return nil, false, err
	}
	now := time.Now()
	budget := floatOf(club["Budget"])
	active := 0
	for _, row := range rows {
		if row["UpgradingTo"] != nil {
			active++
		}
	}

	assets := make([]any, 0, len(AssetTypes))
	for _, t := range AssetTypes {
		def := AssetConfig[t]
		row := rows[t]
		level := levelOf(rows, t)
		upgrading := row != nil && row["UpgradingTo"] != nil && row["CompleteAt"] != nil

		var next any
		if level < MaxAssetLevel {
			target := level + 1
			cost := UpgradeCost(t, target)
			blocked := ""
			if upgrading {
				blocked = "Already upgrading"
			} else if active >= MaxConcurrentUpgrades {
				blocked = "All builders are busy"
			} else {
				for _, req := range def.Requires {
					if levelOf(rows, req.Type) < target-req.LevelOffset {
						blocked = "Requires " + AssetConfig[req.Type].Name + " level " + itoa(target-req.LevelOffset)
						break
					}
				}
				if blocked == "" && budget < cost {
					blocked = "Insufficient budget"
				}
			}
			var blockedAny any
			if blocked != "" {
				blockedAny = blocked
			}
			next = map[string]any{
				"level":         target,
				"cost":          cost,
				"minutes":       UpgradeMinutes(t, target),
				"effectLabel":   EffectLabel(t, target),
				"blockedReason": blockedAny,
			}
		}

		var upgrade any
		if upgrading {
			completeAt := db.StringField(row, "CompleteAt")
			startAt := db.StringField(row, "StartAt")
			if startAt == "" {
				startAt = completeAt
			}
			upgrade = map[string]any{
				"toLevel":     intOf(row["UpgradingTo"]),
				"startAt":     startAt,
				"completeAt":  completeAt,
				"secondsLeft": secondsLeft(completeAt, now),
			}
		}

		assets = append(assets, map[string]any{
			"type":        string(t),
			"name":        def.Name,
			"description": def.Description,
			"level":       level,
			"maxLevel":    MaxAssetLevel,
			"effectLabel": EffectLabel(t, level),
			"effects":     Effects(t, level),
			"upgrade":     upgrade,
			"next":        next,
		})
	}

	return map[string]any{
		"clubId":                clubID,
		"placement":             placementJSON(placementOf(club["CampusPlacement"])),
		"budget":                budget,
		"maxConcurrentUpgrades": MaxConcurrentUpgrades,
		"activeUpgrades":        active,
		"assets":                assets,
	}, true, nil
}

func secondsLeft(completeAt string, now time.Time) int {
	if completeAt == "" {
		return 0
	}
	t, err := time.Parse("2006-01-02T15:04:05.000Z", completeAt)
	if err != nil {
		return 0
	}
	return int(math.Max(math.Ceil(t.Sub(now).Seconds()), 0))
}

func parsePlacement(raw map[string]any) map[string]Placed {
	out := map[string]Placed{}
	for key, v := range raw {
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		out[key] = Placed{X: intOf(m["x"]), Z: intOf(m["z"]), Rot: intOf(m["rot"])}
	}
	return out
}

func placementOf(stored any) map[string]Placed {
	raw, _ := stored.(map[string]any)
	merged := map[string]Placed{}
	for k, v := range DefaultPlacement {
		merged[k] = v
	}
	for k, v := range parsePlacement(raw) {
		merged[k] = v
	}
	if ValidatePlacement(merged) != "" {
		return DefaultPlacement
	}
	return merged
}

func placementJSON(p map[string]Placed) map[string]any {
	out := make(map[string]any, len(p))
	for k, v := range p {
		out[k] = map[string]any{"x": v.X, "z": v.Z, "rot": v.Rot}
	}
	return out
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
