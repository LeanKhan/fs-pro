package calendar

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 11 calendar.* routes.
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("calendar.getCurrentCalendar", http.MethodGet, "/api/calendar/current", []int{200, 400}, h.getCurrentCalendar)
	s.Register("calendar.getSeasonReports", http.MethodGet, "/api/calendar/season-reports", []int{200, 400}, h.getSeasonReports)
	s.Register("calendar.getSeasonReport", http.MethodGet, "/api/calendar/season-reports/{year}", []int{200, 404, 400}, h.getSeasonReport)
	s.Register("calendar.getWorldFeed", http.MethodGet, "/api/calendar/world-feed", []int{200, 400}, h.getWorldFeed)
	s.Register("calendar.getDays", http.MethodGet, "/api/calendar/days", []int{200, 400}, h.getDays)
	s.Register("calendar.deleteDay", http.MethodDelete, "/api/calendar/days/{id}", []int{200, 400}, h.deleteDay)
	s.Register("calendar.getClock", http.MethodGet, "/api/calendar/clock", []int{200, 400}, h.getClock)
	s.Register("calendar.setClock", http.MethodPost, "/api/calendar/clock", []int{200, 400}, h.setClock)
	s.Register("calendar.tickClock", http.MethodPost, "/api/calendar/clock/tick", []int{200, 400}, h.tickClock)
	s.Register("calendar.healCalendar", http.MethodPost, "/api/calendar/heal", []int{200, 400}, h.healCalendar)
	s.Register("calendar.simulateToDate", http.MethodPost, "/api/calendar/simulate-to-date", []int{200, 400}, h.simulateToDate)
}
