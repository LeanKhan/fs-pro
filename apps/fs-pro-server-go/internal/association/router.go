package association

import (
	"net/http"

	"fs-pro-server/internal/httpapi"
)

// Register wires the associations.* routes (05 §3, 02 §G). The mutating routes
// are guarded by a Club rule on the clubId body field (the caller must manage
// the club they act as); the two reads are public projections. The matching
// internal/policy entries are added by the orchestrator:
//
//	associations.create          clubBody("clubId")
//	associations.join            clubBody("clubId")
//	associations.leave           clubBody("clubId")
//	associations.loan            clubBody("clubId")
//	associations.derby           clubBody("clubId")
//	associations.claimDirective  clubBody("clubId")
//	associations.grounds         clubBody("clubId")
//	associations.get             Public
//	associations.directives      Public
func Register(s *httpapi.Server, h *Handlers) {
	s.Register("associations.create", http.MethodPost, "/api/associations", []int{200, 400, 401, 403, 409}, h.create)
	s.Register("associations.get", http.MethodGet, "/api/associations/{id}", []int{200, 404}, h.get)
	s.Register("associations.join", http.MethodPost, "/api/associations/{id}/join", []int{200, 400, 401, 403, 404, 409}, h.join)
	s.Register("associations.leave", http.MethodPost, "/api/associations/{id}/leave", []int{200, 401, 403, 404}, h.leave)
	s.Register("associations.loan", http.MethodPost, "/api/associations/{id}/loans", []int{200, 400, 401, 403, 404, 409}, h.loan)
	s.Register("associations.derby", http.MethodPost, "/api/associations/{id}/derby/{derbyId}", []int{200, 400, 401, 403, 404, 409}, h.derby)
	s.Register("associations.directives", http.MethodGet, "/api/associations/{id}/directives", []int{200, 404}, h.directives)
	s.Register("associations.claimDirective", http.MethodPost, "/api/associations/{id}/directives/{directiveId}/claim", []int{200, 400, 401, 403, 404, 409}, h.claimDirective)
	s.Register("associations.grounds", http.MethodPost, "/api/associations/{id}/grounds", []int{200, 400, 401, 403, 404, 409}, h.grounds)
}
