package place

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Handlers implements the places.* routes.
type Handlers struct {
	repo  *Repository
	world *WorldService
}

// New builds the handler set.
func New(repo *Repository, world *WorldService) *Handlers { return &Handlers{repo: repo, world: world} }

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

func (h *Handlers) getPlaces(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	filter := Filter{}
	if v := q.Get("type"); v != "" {
		filter.Type, filter.HasType = v, true
	}
	if v := q.Get("code"); v != "" {
		filter.Code, filter.HasCode = v, true
	}
	if v := q.Get("name"); v != "" {
		filter.Name, filter.HasName = v, true
	}
	if v := q.Get("region"); v != "" {
		filter.Region, filter.HasRegion = v, true
	}
	places, err := h.repo.FindAll(r.Context(), filter)
	if err != nil {
		return httpapi.Fail(400, "Error fetching players", err.Error())
	}
	return httpapi.OK("Places fetched successfully", places)
}

func (h *Handlers) getCountries(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	places, err := h.repo.FindAll(r.Context(), Filter{Type: "country", HasType: true})
	if err != nil {
		return httpapi.Fail(400, "Error fetching Countries", err.Error())
	}
	return httpapi.OK("Countries fetched successfully", places)
}

func (h *Handlers) importFromWorld(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	place, err := h.world.ImportCountryFromWorld(r.Context(), str(body(cx), "entity_id"))
	if err != nil {
		return httpapi.Fail(400, "Error importing country", err.Error())
	}
	return httpapi.OK("Country imported from the world", place)
}

func (h *Handlers) syncFromWorld(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	summary, err := h.world.SyncFromWorld(r.Context())
	if err != nil {
		return httpapi.Fail(400, "Error syncing countries", err.Error())
	}
	message := "Countries synced from the world"
	if summary.Offline {
		message = "World unreachable; local snapshots left unchanged"
	}
	return httpapi.OK(message, summary)
}

func (h *Handlers) resolveAnchor(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	anchor, err := h.world.ResolveAnchor(r.Context(), str(body(cx), "entity_id"))
	if err != nil {
		return httpapi.Fail(400, "Error resolving anchor", err.Error())
	}
	payload := map[string]any{
		"resolved":       anchor != nil,
		"breadcrumbs":    []string{},
		"city":           nil,
		"countryId":      nil,
		"missingCountry": nil,
	}
	if anchor != nil {
		payload["breadcrumbs"] = anchor.Breadcrumbs
		if anchor.HasCity {
			payload["city"] = anchor.City
		}
		if anchor.HasCountryID {
			payload["countryId"] = anchor.CountryID
		}
		if anchor.MissingCountry != nil {
			payload["missingCountry"] = anchor.MissingCountry
		}
	}
	message := "Anchor could not be resolved"
	if anchor != nil {
		message = "Anchor resolved"
	}
	return httpapi.OK(message, payload)
}

func (h *Handlers) getPlace(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	place, ok, err := h.repo.FindByID(r.Context(), r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(400, "Error fetching Place", err.Error())
	}
	if !ok {
		return httpapi.OK("Place fetched successfully", nil)
	}
	return httpapi.OK("Place fetched successfully", place)
}

func (h *Handlers) getPlaceByName(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	place, ok, err := h.repo.FindByNameOrCode(r.Context(), r.PathValue("name"))
	if err != nil {
		return httpapi.Fail(400, "Error fetching Place", err.Error())
	}
	if !ok {
		return httpapi.OK("Place fetched successfully", nil)
	}
	return httpapi.OK("Place fetched successfully", place)
}

func (h *Handlers) updatePlace(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	place, ok, err := h.repo.Update(r.Context(), r.PathValue("id"), body(cx))
	if err != nil {
		return httpapi.Fail(400, "Error updating Place", err.Error())
	}
	if !ok {
		return httpapi.OK("Place updated successfully", nil)
	}
	return httpapi.OK("Place updated successfully", place)
}
