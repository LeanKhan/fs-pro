package fixture

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 4 fixtures.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("fixtures.getFixtures", http.MethodGet, "/api/fixtures", []int{200, 400}, h.getFixtures)
	s.Register("fixtures.getScheduleSummary", http.MethodGet, "/api/fixtures/schedule-summary", []int{200, 400}, h.getScheduleSummary)
	s.Register("fixtures.getFixture", http.MethodGet, "/api/fixtures/{id}", []int{200, 400}, h.getFixture)
	s.Register("fixtures.deleteFixture", http.MethodDelete, "/api/fixtures/{id}", []int{200, 400}, h.deleteFixture)
}
