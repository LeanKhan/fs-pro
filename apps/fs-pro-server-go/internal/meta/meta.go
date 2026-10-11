// Package meta serves the constant database-status route.
package meta

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires GET /api/meta/db. The payload is the constant
// {backend:"postgresql"}, exactly like meta.router.ts.
func Register(s *httpapi.Server) {
	s.Register("meta.getDbStatus", http.MethodGet, "/api/meta/db", []int{200},
		func(*httpapi.Context, http.ResponseWriter, *http.Request) httpapi.Response {
			return httpapi.OKStatus(200, "Database status fetched successfully",
				map[string]any{"backend": "postgresql"})
		})
}
