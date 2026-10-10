package abilities

import (
	"errors"
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the abilities.*/traits.*/orders.* routes (05 §3, 03 §2).
// Club-scoped routes are guarded by the route-policy table (clubParam/player);
// the handlers additionally scope every player id to the club in the path, so a
// mismatched pid can never read or mutate another club's player.
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

// list is GET /api/clubs/{id}/abilities.
func (h *Handlers) list(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.BuildClubAbilities(r.Context(), r.PathValue("id"))
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("Abilities", payload)
}

// slot is POST /api/clubs/{id}/players/{pid}/abilities.
func (h *Handlers) slot(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("id")
	playerID := r.PathValue("pid")
	abilityID := str(body(cx), "abilityId")
	if abilityID == "" {
		return httpapi.Fail(400, "abilityId is required", "abilityId is required")
	}
	if err := h.repo.SlotAbility(r.Context(), clubID, playerID, abilityID); err != nil {
		return mapErr(err)
	}
	return h.loadout(r, playerID, "Ability slotted")
}

// traits is GET /api/traits.
func (h *Handlers) traits(_ *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	list := make([]any, 0, len(Traits))
	for _, t := range Traits {
		list = append(list, map[string]any{
			"id":          t.ID,
			"name":        t.Name,
			"description": t.Description,
			"rarity":      string(RarityShiny),
			"effect":      string(t.Effect),
		})
	}
	return httpapi.OK("Traits", map[string]any{
		"traits":   list,
		"rarities": []string{string(RarityShiny), string(RarityGlowy), string(RarityStarry)},
		"maxSlots": MaxTraitSlots,
	})
}

// equip is POST /api/clubs/{id}/players/{pid}/traits.
func (h *Handlers) equip(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("id")
	playerID := r.PathValue("pid")
	b := body(cx)
	traitID := str(b, "traitId")
	slot, ok := intField(b, "slot")
	if traitID == "" || !ok {
		return httpapi.Fail(400, "traitId and slot are required", "traitId and slot are required")
	}
	if err := h.repo.EquipTrait(r.Context(), clubID, playerID, traitID, slot); err != nil {
		return mapErr(err)
	}
	return h.loadout(r, playerID, "Trait equipped")
}

// orders is GET /api/clubs/{id}/orders.
func (h *Handlers) orders(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	payload, ok, err := h.repo.BuildOrderInventory(r.Context(), r.PathValue("id"))
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("War Room orders", payload)
}

// prepare is POST /api/clubs/{id}/orders.
func (h *Handlers) prepare(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	clubID := r.PathValue("id")
	b := body(cx)
	orderID := str(b, "orderId")
	count, ok := intField(b, "count")
	if orderID == "" || !ok {
		return httpapi.Fail(400, "orderId and count are required", "orderId and count are required")
	}
	entry, err := h.repo.PrepareOrder(r.Context(), clubID, orderID, count)
	if err != nil {
		return mapErr(err)
	}
	payload, ok, err := h.repo.BuildOrderInventory(r.Context(), clubID)
	if err != nil {
		return mapErr(err)
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	payload["prepared"] = map[string]any{"orderId": entry.Order, "count": entry.Count}
	return httpapi.OK("Order prepared", payload)
}

// loadout reloads a player's ability/trait screen after a mutation.
func (h *Handlers) loadout(r *http.Request, playerID, message string) httpapi.Response {
	payload, err := h.repo.PlayerLoadout(r.Context(), playerID)
	if err != nil {
		return mapErr(err)
	}
	return httpapi.OK(message, payload)
}

// mapErr maps the abilities sentinel errors to the routes' declared statuses.
func mapErr(err error) httpapi.Response {
	msg := err.Error()
	switch {
	case errors.Is(err, ErrClubNotFound), errors.Is(err, ErrPlayerNotFound),
		errors.Is(err, ErrUnknownAbility), errors.Is(err, ErrUnknownTrait),
		errors.Is(err, ErrUnknownOrder), errors.Is(err, ErrTraitNotEquipped):
		return httpapi.Fail(404, msg, msg)
	case errors.Is(err, ErrFamilyMismatch), errors.Is(err, ErrFacilityGate),
		errors.Is(err, ErrMasteryGate), errors.Is(err, ErrSlotCap),
		errors.Is(err, ErrInsufficientFunds), errors.Is(err, ErrInsufficientAlloys),
		errors.Is(err, ErrMaxRarity):
		return httpapi.Fail(409, msg, msg)
	case errors.Is(err, ErrInvalidSlot), errors.Is(err, ErrInvalidCount), errors.Is(err, ErrInvalidXp):
		return httpapi.Fail(400, msg, msg)
	default:
		return httpapi.Fail(400, msg, msg)
	}
}
