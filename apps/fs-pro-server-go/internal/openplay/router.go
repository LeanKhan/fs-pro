package openplay

import (
	"net/http"
	"strings"

	"fs-pro-server/internal/httpapi"
)

// Register wires the 26 open-play routes (editions + challenges + definitions).
func Register(s *httpapi.Server, h *Handlers) {
	editionStatuses := []int{200, 400, 401, 403, 404, 409}

	// editions: the list is exact; every other GET path shares one catch-all
	// pattern (Go's ServeMux cannot express both `/editions/club/{clubId}` and
	// `/editions/{id}/rankings`). They are all declared stubs, so one handler
	// serves them; the manifest lists each contract path separately.
	s.Register("editions.list", http.MethodGet, "/api/editions", editionStatuses, h.listEditions)
	for _, r := range []struct {
		id, path string
	}{
		{"editions.get", "/api/editions/{id}"},
		{"editions.eligibility", "/api/editions/{id}/eligibility/{clubId}"},
		{"editions.rankings", "/api/editions/{id}/rankings"},
		{"editions.bracket", "/api/editions/{id}/bracket"},
		{"editions.eligibleOpponents", "/api/editions/{id}/opponents/{clubId}"},
		{"editions.clubEntries", "/api/editions/club/{clubId}"},
		{"editions.getEntryPolicy", "/api/editions/policy/{clubId}"},
	} {
		s.ManifestOnly(r.id, http.MethodGet, r.path, editionStatuses)
	}
	s.HandleRaw(http.MethodGet, "/api/editions/{rest...}", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(r.PathValue("rest"), "/")
		cx := httpapi.Get(r)
		var resp httpapi.Response
		switch {
		case len(parts) == 1:
			r.SetPathValue("id", parts[0])
			resp = h.getEdition(cx, w, r)
		case len(parts) == 2 && parts[1] == "rankings":
			r.SetPathValue("id", parts[0])
			resp = h.editionRankings(cx, w, r)
		case len(parts) == 2 && parts[1] == "bracket":
			r.SetPathValue("id", parts[0])
			resp = h.editionBracket(cx, w, r)
		case len(parts) == 2 && parts[0] == "club":
			r.SetPathValue("clubId", parts[1])
			resp = h.clubEntries(cx, w, r)
		case len(parts) == 2 && parts[0] == "policy":
			r.SetPathValue("clubId", parts[1])
			resp = h.getEntryPolicy(cx, w, r)
		case len(parts) == 3 && parts[1] == "eligibility":
			r.SetPathValue("id", parts[0])
			r.SetPathValue("clubId", parts[2])
			resp = h.editionEligibility(cx, w, r)
		case len(parts) == 3 && parts[1] == "opponents":
			r.SetPathValue("id", parts[0])
			r.SetPathValue("clubId", parts[2])
			resp = h.eligibleOpponents(cx, w, r)
		default:
			resp = stub("Fetching an edition")
		}
		httpapi.Respond(w, resp)
	})

	s.Register("editions.create", http.MethodPost, "/api/editions", []int{201, 400, 401, 403, 404, 409}, h.createEdition)
	s.Register("editions.action", http.MethodPost, "/api/editions/{id}/status/{action}", editionStatuses, h.editionAction)
	s.Register("editions.invite", http.MethodPost, "/api/editions/{id}/invite", editionStatuses, h.inviteClubs)
	s.Register("editions.register", http.MethodPost, "/api/editions/{id}/entries/{clubId}", editionStatuses, h.registerEntry)
	s.Register("editions.withdraw", http.MethodDelete, "/api/editions/{id}/entries/{clubId}", editionStatuses, h.withdrawEntry)
	s.Register("editions.setEntryPolicy", http.MethodPut, "/api/editions/policy/{clubId}", editionStatuses, h.setEntryPolicy)

	// challenges
	s.Register("challenges.propose", http.MethodPost, "/api/challenges", []int{201, 400, 401, 403, 404, 409}, h.proposeChallenge)
	s.Register("challenges.respond", http.MethodPost, "/api/challenges/{fixtureId}/{action}", editionStatuses, h.respondChallenge)
	s.Register("challenges.forClub", http.MethodGet, "/api/challenges/club/{clubId}", editionStatuses, h.challengesForClub)
	s.Register("challenges.forEdition", http.MethodGet, "/api/challenges/edition/{editionId}", editionStatuses, h.challengesForEdition)
	s.Register("challenges.getPolicy", http.MethodGet, "/api/challenges/policy/{clubId}", editionStatuses, h.getChallengePolicy)
	s.Register("challenges.setPolicy", http.MethodPut, "/api/challenges/policy/{clubId}", editionStatuses, h.setChallengePolicy)

	// competition definitions
	s.Register("competitionDefinitions.list", http.MethodGet, "/api/competition-definitions", []int{200, 400}, h.listDefinitions)
	s.Register("competitionDefinitions.get", http.MethodGet, "/api/competition-definitions/{id}", []int{200, 400, 404}, h.getDefinition)
	s.Register("competitionDefinitions.validate", http.MethodPost, "/api/competition-definitions/validate", []int{200, 400}, h.validateDefinition)
	s.Register("competitionDefinitions.create", http.MethodPost, "/api/competition-definitions", []int{201, 400, 401, 403, 404, 409}, h.createDefinition)
	s.Register("competitionDefinitions.update", http.MethodPut, "/api/competition-definitions/{id}", []int{200, 400, 401, 403, 404}, h.updateDefinition)
	s.Register("competitionDefinitions.archive", http.MethodPost, "/api/competition-definitions/{id}/archive", []int{200, 400, 401, 403, 404}, h.archiveDefinition)
}
