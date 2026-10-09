package openplay

import (
	"net/http"
	"strings"

	"fs-pro-server/internal/auth"
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

func (h *Handlers) editionAction() httpapi.Response      { return stub("Edition status actions") }
func (h *Handlers) inviteClubs() httpapi.Response        { return stub("Inviting clubs") }
func (h *Handlers) editionEligibility() httpapi.Response { return stub("Edition eligibility") }

// createEdition is POST /api/editions (admin).
func (h *Handlers) createEdition(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireAdmin(cx, r); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	if body == nil {
		return httpapi.Fail(400, "Invalid body", nil)
	}
	dates := EditionDates{
		RegistrationOpensDay:  intVal(body["registrationOpensDay"]),
		RegistrationClosesDay: intVal(body["registrationClosesDay"]),
		StartDay:              intVal(body["startDay"]),
	}
	season, err := h.repo.CreateEdition(r.Context(), db.StringField(body, "competitionId"), dates)
	if err != nil {
		return editionFail(err)
	}
	return httpapi.OKStatus(201, "Edition created", editionFields(season))
}

// registerEntry is POST /api/editions/{id}/entries/{clubId} (owner/admin).
func (h *Handlers) registerEntry(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	entry, err := h.repo.Register(r.Context(), r.PathValue("id"), r.PathValue("clubId"))
	if err != nil {
		return editionFail(err)
	}
	return httpapi.OK("Registered", entryFields(entry))
}

// withdrawEntry is DELETE /api/editions/{id}/entries/{clubId} (owner/admin).
func (h *Handlers) withdrawEntry(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	ctx := r.Context()
	id, club := r.PathValue("id"), r.PathValue("clubId")
	rows, err := h.repo.Q().Query(ctx, `SELECT "Status" FROM "Entries" WHERE "SeasonId" = $1 AND "ClubId" = $2 LIMIT 1`, id, club)
	if err != nil {
		return editionFail(err)
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		return editionFail(err)
	}
	if ok && db.StringField(m, "Status") == "invited" {
		err = h.repo.DeclineInvite(ctx, id, club)
	} else {
		err = h.repo.Withdraw(ctx, id, club)
	}
	if err != nil {
		return editionFail(err)
	}
	return httpapi.OK("Withdrawn", map[string]any{"ok": true})
}
func (h *Handlers) editionBracket() httpapi.Response    { return stub("Edition brackets") }
func (h *Handlers) eligibleOpponents() httpapi.Response { return stub("Eligible opponents") }

// getEdition is GET /api/editions/{id}.
func (h *Handlers) getEdition(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	season, ok, err := h.repo.Edition(ctx, r.PathValue("id"))
	if err != nil || !ok {
		return httpapi.Fail(404, "Edition not found", nil)
	}
	entries, err := h.repo.EditionEntries(ctx, r.PathValue("id"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	out := editionFields(season)
	list := make([]any, 0, len(entries))
	for _, e := range entries {
		entry := entryFields(e)
		entry["clubName"] = db.StringField(e, "clubName")
		entry["clubCode"] = db.StringField(e, "clubCode")
		list = append(list, entry)
	}
	out["entries"] = list
	return httpapi.OK("OK", out)
}

// editionRankings is GET /api/editions/{id}/rankings.
func (h *Handlers) editionRankings(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	ctx := r.Context()
	season, ok, err := h.repo.Edition(ctx, r.PathValue("id"))
	if err != nil || !ok {
		return httpapi.Fail(404, "Edition not found", nil)
	}
	stage := intVal(season["CurrentStage"])
	if v := r.URL.Query().Get("stage"); v != "" {
		stage = atoiOr(v, stage)
	}
	table, err := h.repo.RankingsTable(ctx, r.PathValue("id"), stage, r.URL.Query().Get("group"))
	if err != nil {
		return httpapi.Fail(404, "Not found", nil)
	}
	return httpapi.OK("OK", table)
}

// clubEntries is GET /api/editions/club/{clubId}.
func (h *Handlers) clubEntries(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	rows, err := h.repo.ClubEntries(r.Context(), r.PathValue("clubId"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		entry := entryFields(row)
		entry["edition"] = map[string]any{
			"id":                    db.StringField(row, "SeasonId"),
			"competitionId":         nullableString(row, "CompetitionId"),
			"code":                  db.StringField(row, "SeasonCode"),
			"title":                 db.StringField(row, "Title"),
			"editionNumber":         intOrNil(row["EditionNumber"]),
			"status":                db.StringField(row, "editionStatus"),
			"published":             row["Definition"] != nil,
			"registrationOpensDay":  intOrNil(row["RegistrationOpensDay"]),
			"registrationClosesDay": intOrNil(row["RegistrationClosesDay"]),
			"startDay":              intOrNil(row["StartDay"]),
			"endDay":                intOrNil(row["EndDay"]),
			"currentStage":          intVal(row["CurrentStage"]),
			"stageStartedDay":       intOrNil(row["StageStartedDay"]),
			"winnerId":              nullableString(row, "WinnerId"),
			"definition":            row["Definition"],
			"competitionName":       db.StringField(row, "competitionName"),
		}
		out = append(out, entry)
	}
	return httpapi.OK("OK", out)
}

// getEntryPolicy is GET /api/editions/policy/{clubId}.
func (h *Handlers) getEntryPolicy(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	policy, ok, err := h.repo.ClubPolicy(r.Context(), r.PathValue("clubId"), "EntryPolicy")
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("OK", policy)
}

// setEntryPolicy is PUT /api/editions/policy/{clubId}.
func (h *Handlers) setEntryPolicy(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	var policy any
	if body != nil {
		policy = body["policy"]
	}
	if err := h.repo.SetClubPolicy(r.Context(), r.PathValue("clubId"), "EntryPolicy", policy); err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	message := "Auto-register policy cleared"
	if policy != nil {
		message = "Auto-register policy saved"
	}
	return httpapi.OK(message, policy)
}

// --- challenges ------------------------------------------------------------

func (h *Handlers) proposeChallenge() httpapi.Response { return stub("Proposing a challenge") }
func (h *Handlers) respondChallenge() httpapi.Response { return stub("Responding to a challenge") }

// challengesForClub is GET /api/challenges/club/{clubId}.
func (h *Handlers) challengesForClub(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	var statuses []string
	if s := r.URL.Query().Get("status"); s != "" {
		for _, part := range strings.Split(s, ",") {
			if part != "" {
				statuses = append(statuses, part)
			}
		}
	}
	rows, err := h.repo.ChallengesForClub(r.Context(), r.PathValue("clubId"), statuses)
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, toChallenge(row, r.PathValue("clubId")))
	}
	return httpapi.OK("OK", out)
}

// challengesForEdition is GET /api/challenges/edition/{editionId} (admin).
func (h *Handlers) challengesForEdition(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireAdmin(cx, r); !ok {
		return denial
	}
	rows, err := h.repo.ChallengesForEdition(r.Context(), r.PathValue("editionId"))
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	out := make([]any, 0, len(rows))
	for _, row := range rows {
		ch := toChallenge(row, "")
		ch["competitionName"] = row["competitionName"]
		out = append(out, ch)
	}
	return httpapi.OK("OK", out)
}

// getChallengePolicy is GET /api/challenges/policy/{clubId}.
func (h *Handlers) getChallengePolicy(_ *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	policy, ok, err := h.repo.ClubPolicy(r.Context(), r.PathValue("clubId"), "ChallengePolicy")
	if err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	if !ok {
		return httpapi.Fail(404, "Club not found", nil)
	}
	return httpapi.OK("OK", policy)
}

// setChallengePolicy is PUT /api/challenges/policy/{clubId}.
func (h *Handlers) setChallengePolicy(cx *httpapi.Context, _ http.ResponseWriter, r *http.Request) httpapi.Response {
	if denial, ok := h.requireClub(cx, r); !ok {
		return denial
	}
	body, _ := cx.BodyMap()
	var policy any
	if body != nil {
		policy = body["policy"]
	}
	if err := h.repo.SetClubPolicy(r.Context(), r.PathValue("clubId"), "ChallengePolicy", policy); err != nil {
		return httpapi.Fail(400, err.Error(), err.Error())
	}
	message := "Auto-accept policy cleared"
	if policy != nil {
		message = "Auto-accept policy saved"
	}
	return httpapi.OK(message, policy)
}

// --- helpers ---------------------------------------------------------------

func editionFields(m map[string]any) map[string]any {
	return map[string]any{
		"id":                    db.StringField(m, "_id"),
		"competitionId":         nullableString(m, "CompetitionId"),
		"code":                  db.StringField(m, "SeasonCode"),
		"title":                 db.StringField(m, "Title"),
		"editionNumber":         intOrNil(m["EditionNumber"]),
		"status":                db.StringField(m, "Status"),
		"published":             m["Definition"] != nil,
		"registrationOpensDay":  intOrNil(m["RegistrationOpensDay"]),
		"registrationClosesDay": intOrNil(m["RegistrationClosesDay"]),
		"startDay":              intOrNil(m["StartDay"]),
		"endDay":                intOrNil(m["EndDay"]),
		"currentStage":          intVal(m["CurrentStage"]),
		"stageStartedDay":       intOrNil(m["StageStartedDay"]),
		"winnerId":              nullableString(m, "WinnerId"),
		"definition":            m["Definition"],
	}
}

func entryFields(e map[string]any) map[string]any {
	status := db.StringField(e, "entryStatus")
	if status == "" {
		status = db.StringField(e, "Status")
	}
	return map[string]any{
		"seasonId":          db.StringField(e, "SeasonId"),
		"clubId":            db.StringField(e, "ClubId"),
		"status":            status,
		"seed":              e["Seed"],
		"group":             e["Group"],
		"division":          e["Division"],
		"feePaid":           e["FeePaid"],
		"eliminatedAtStage": e["EliminatedAtStage"],
		"finalPosition":     e["FinalPosition"],
		"finishScore":       e["FinishScore"],
	}
}

func toChallenge(f map[string]any, clubID string) map[string]any {
	out := map[string]any{
		"id":               db.StringField(f, "_id"),
		"seasonId":         nullableString(f, "SeasonId"),
		"competitionId":    nullableString(f, "CompetitionId"),
		"stageIndex":       intOrNil(f["StageIndex"]),
		"status":           f["ChallengeStatus"],
		"challengerClubId": nullableString(f, "ChallengerClubId"),
		"homeClubId":       nullableString(f, "HomeTeamId"),
		"awayClubId":       nullableString(f, "AwayTeamId"),
		"title":            db.StringField(f, "Title"),
		"respondBy":        f["RespondBy"],
		"scheduledDay":     f["ScheduledDay"],
		"played":           boolVal(f["Played"]),
		"competitionName":  f["competitionName"],
	}
	if clubID != "" {
		if db.StringField(f, "HomeTeamId") == clubID {
			out["direction"] = "incoming"
		} else {
			out["direction"] = "outgoing"
		}
	}
	return out
}

func atoiOr(v string, fallback int) int {
	n := 0
	if v == "" {
		return fallback
	}
	for _, c := range v {
		if c < '0' || c > '9' {
			return fallback
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// requireClub enforces owner/admin for the clubID path param.
func (h *Handlers) requireClub(cx *httpapi.Context, r *http.Request) (httpapi.Response, bool) {
	status, msg := auth.CanManageClub(r.Context(), h.repo.Q(), sessionUser(cx), r.PathValue("clubId"))
	if status != 0 {
		return httpapi.Fail(status, msg, nil), false
	}
	return httpapi.Response{}, true
}

// requireAdmin enforces the admin gate.
func (h *Handlers) requireAdmin(cx *httpapi.Context, r *http.Request) (httpapi.Response, bool) {
	if !auth.IsAdminByID(r.Context(), h.repo.Q(), sessionUser(cx)) {
		return httpapi.Fail(403, "You do not manage this club", nil), false
	}
	return httpapi.Response{}, true
}

func sessionUser(cx *httpapi.Context) string {
	if cx != nil && cx.Session != nil {
		return cx.Session.UserID()
	}
	return ""
}

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

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
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
