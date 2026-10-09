package httpapi

import "net/http"

// RouteInfo is one entry in the GET /__routes manifest.
type RouteInfo struct {
	ID       string `json:"id"`
	Method   string `json:"method"`
	Path     string `json:"path"`
	Statuses []int  `json:"statuses"`
}

// manifestHandler serves the dev-only route manifest.
func (s *Server) manifestHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, s.Routes())
}
