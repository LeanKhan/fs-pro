package openplay

import (
	"net/http"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Handlers implements the open-play routes.
type Handlers struct {
	repo *Repository
}

// New builds the handler set.
func New(repo *Repository) *Handlers { return &Handlers{repo: repo} }

func stub(what string) httpapi.Response {
	return httpapi.Fail(400, what+" is not available in the Go server yet", nil)
}

// --- editions --------------------------------------------------------------

// listEditions is GET /api/editions.
func (h *Handlers) listEditions(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	q := r.URL.Query()
	editions, err := h.repo.Editions(r.Context(), q.Get("status"), q.Get("competitionId"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	names := map[string]string{}
	for _, e := range editions {
		if id := db.StringField(e, "CompetitionId"); id != "" {
			names[id] = ""
		}
	}
	if len(names) > 0 {
		comps, cerr := h.repo.Competitions(r.Context(), true)
		if cerr == nil {
			for _, c := range comps {
				names[db.StringField(c, "_id")] = db.StringField(c, "Name")
			}
		}
	}
	out := make([]any, 0, len(editions))
	for _, e := range editions {
		out = append(out, editionListItem(e, names))
	}
	return httpapi.OK("OK", out)
}

func editionListItem(e map[string]any, names map[string]string) map[string]any {
	var compName any
	if id := db.StringField(e, "CompetitionId"); id != "" {
		compName = names[id]
	}
	return map[string]any{
		"id":                    db.StringField(e, "_id"),
		"competitionId":         nullableString(e, "CompetitionId"),
		"code":                  db.StringField(e, "SeasonCode"),
		"title":                 db.StringField(e, "Title"),
		"editionNumber":         intOrNil(e["EditionNumber"]),
		"status":                db.StringField(e, "Status"),
		"published":             e["Definition"] != nil,
		"registrationOpensDay":  intOrNil(e["RegistrationOpensDay"]),
		"registrationClosesDay": intOrNil(e["RegistrationClosesDay"]),
		"startDay":              intOrNil(e["StartDay"]),
		"endDay":                intOrNil(e["EndDay"]),
		"currentStage":          intVal(e["CurrentStage"]),
		"stageStartedDay":       intOrNil(e["StageStartedDay"]),
		"winnerId":              nullableString(e, "WinnerId"),
		"definition":            e["Definition"],
		"competitionName":       compName,
	}
}

func (h *Handlers) getEdition() httpapi.Response         { return stub("Fetching an edition") }
func (h *Handlers) createEdition() httpapi.Response      { return stub("Creating an edition") }
func (h *Handlers) editionAction() httpapi.Response      { return stub("Edition status actions") }
func (h *Handlers) inviteClubs() httpapi.Response        { return stub("Inviting clubs") }
func (h *Handlers) editionEligibility() httpapi.Response { return stub("Edition eligibility") }
func (h *Handlers) registerEntry() httpapi.Response      { return stub("Registering for an edition") }
func (h *Handlers) withdrawEntry() httpapi.Response      { return stub("Withdrawing from an edition") }
func (h *Handlers) editionRankings() httpapi.Response    { return stub("Edition rankings") }
func (h *Handlers) editionBracket() httpapi.Response     { return stub("Edition brackets") }
func (h *Handlers) eligibleOpponents() httpapi.Response  { return stub("Eligible opponents") }
func (h *Handlers) clubEntries() httpapi.Response        { return stub("Club entries") }
func (h *Handlers) getEntryPolicy() httpapi.Response     { return stub("The entry policy") }
func (h *Handlers) setEntryPolicy() httpapi.Response     { return stub("Setting the entry policy") }

// --- challenges ------------------------------------------------------------

func (h *Handlers) proposeChallenge() httpapi.Response     { return stub("Proposing a challenge") }
func (h *Handlers) respondChallenge() httpapi.Response     { return stub("Responding to a challenge") }
func (h *Handlers) challengesForClub() httpapi.Response    { return stub("A club's challenges") }
func (h *Handlers) challengesForEdition() httpapi.Response { return stub("An edition's challenges") }
func (h *Handlers) getChallengePolicy() httpapi.Response   { return stub("The challenge policy") }
func (h *Handlers) setChallengePolicy() httpapi.Response   { return stub("Setting the challenge policy") }

// --- competition definitions -----------------------------------------------

// listDefinitions is GET /api/competition-definitions.
func (h *Handlers) listDefinitions(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	includeArchived := r.URL.Query().Get("includeArchived") == "true"
	comps, err := h.repo.Competitions(r.Context(), includeArchived)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	out := make([]any, 0, len(comps))
	ids := make([]string, 0, len(comps))
	for _, c := range comps {
		ids = append(ids, db.StringField(c, "_id"))
	}
	latest, err := h.repo.LatestEditions(r.Context(), ids)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	for _, c := range comps {
		out = append(out, competitionSummary(c, latest[db.StringField(c, "_id")]))
	}
	return httpapi.OK("Competitions", out)
}

// getDefinition is GET /api/competition-definitions/{id}.
func (h *Handlers) getDefinition(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	comp, ok, err := h.repo.Competition(ctx, r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(404, err.Error(), nil)
	}
	if !ok {
		return httpapi.Fail(404, "Competition not found", nil)
	}
	latest, err := h.repo.LatestEditions(ctx, []string{db.StringField(comp, "_id")})
	if err != nil {
		return httpapi.Fail(404, err.Error(), nil)
	}
	return httpapi.OK("Competition", competitionSummary(comp, latest[db.StringField(comp, "_id")]))
}

// validateDefinition is POST /api/competition-definitions/validate.
func (h *Handlers) validateDefinition(cx *httpapi.Context, _ http.ResponseWriter, _ *http.Request) httpapi.Response {
	body, _ := cx.BodyMap()
	if body == nil {
		body = map[string]any{}
	}
	def, errs, ok := ValidateDefinition(body)
	message := "Invalid"
	var defPayload any
	if ok {
		defPayload, message = def, "Valid"
	}
	return httpapi.OK(message, map[string]any{"ok": ok, "definition": defPayload, "errors": errs})
}

func (h *Handlers) createDefinition() httpapi.Response {
	return stub("Creating a competition definition")
}
func (h *Handlers) updateDefinition() httpapi.Response {
	return stub("Updating a competition definition")
}
func (h *Handlers) archiveDefinition() httpapi.Response {
	return stub("Archiving a competition definition")
}

// competitionSummary assembles the camelCase CompetitionSummarySchema Node's
// summaries() produces: `definition` from the Competitions columns and
// `latestEdition` from the newest Seasons row.
func competitionSummary(c, latest map[string]any) map[string]any {
	var definition any
	if c["Stages"] != nil {
		def := map[string]any{
			"Name":         db.StringField(c, "Name"),
			"Prestige":     intVal(c["Prestige"]),
			"Entry":        c["Entry"],
			"Stages":       c["Stages"],
			"WinCondition": c["WinCondition"],
			"Rewards":      c["Rewards"],
			"Recurrence":   c["Recurrence"],
		}
		if c["Description"] != nil {
			def["Description"] = c["Description"]
		}
		if c["Outcomes"] != nil {
			def["Outcomes"] = c["Outcomes"]
		}
		definition = def
	}
	var latestEdition any
	if latest != nil {
		latestEdition = map[string]any{
			"id":            db.StringField(latest, "_id"),
			"code":          db.StringField(latest, "SeasonCode"),
			"status":        db.StringField(latest, "Status"),
			"editionNumber": intOrNil(latest["EditionNumber"]),
		}
	}
	return map[string]any{
		"id":            db.StringField(c, "_id"),
		"code":          db.StringField(c, "CompetitionCode"),
		"name":          db.StringField(c, "Name"),
		"type":          db.StringField(c, "Type"),
		"description":   c["Description"],
		"prestige":      intVal(c["Prestige"]),
		"archived":      boolVal(c["Archived"]),
		"definition":    definition,
		"latestEdition": latestEdition,
	}
}

func intOrNil(v any) any {
	if v == nil {
		return nil
	}
	if n, ok := asInt(v); ok {
		return n
	}
	return nil
}

func intVal(v any) int {
	if n, ok := asInt(v); ok {
		return n
	}
	return 0
}

func nullableString(m map[string]any, key string) any {
	if s := db.StringField(m, key); s != "" {
		return s
	}
	return nil
}

func boolVal(v any) bool { b, _ := v.(bool); return b }

func asInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	case float32:
		return int(n), true
	default:
		return 0, false
	}
}
