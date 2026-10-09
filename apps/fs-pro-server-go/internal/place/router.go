package place

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 8 places.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("places.getPlaces", http.MethodGet, "/api/places", []int{200, 400}, h.getPlaces)
	s.Register("places.getCountries", http.MethodGet, "/api/places/country", []int{200, 400}, h.getCountries)
	s.Register("places.importFromWorld", http.MethodPost, "/api/places/import-from-world", []int{200, 400}, h.importFromWorld)
	s.Register("places.syncFromWorld", http.MethodPost, "/api/places/sync-from-world", []int{200, 400}, h.syncFromWorld)
	s.Register("places.resolveAnchor", http.MethodPost, "/api/places/resolve-anchor", []int{200, 400}, h.resolveAnchor)
	s.Register("places.getPlace", http.MethodGet, "/api/places/{id}", []int{200, 400}, h.getPlace)
	s.Register("places.getPlaceByName", http.MethodGet, "/api/places/name/{name}", []int{200, 400}, h.getPlaceByName)
	s.Register("places.updatePlace", http.MethodPut, "/api/places/{id}", []int{200, 400}, h.updatePlace)
}
