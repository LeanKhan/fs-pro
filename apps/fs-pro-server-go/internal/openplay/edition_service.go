package openplay

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// Edition lifecycle + eligibility, ported from
// apps/fs-pro-server/src/services/competitions/edition.service.ts. Only the
// create / register / withdraw paths are wired; publish/cancel (which needs the
// Zod definition builder) and invite remain stubs.

// entryHolding lists the entry statuses that hold a place in an edition.
var entryHolding = []string{"registered", "active"}

// EditionDates is the admin-supplied scheduling for a new draft edition.
type EditionDates struct {
	RegistrationOpensDay  int
	RegistrationClosesDay int
	StartDay              int
}

// Eligibility is the checkEligibility result shape.
type Eligibility struct {
	Eligible bool     `json:"eligible"`
	Reasons  []string `json:"reasons"`
	Fee      float64  `json:"fee"`
}

// editionError mirrors EditionError: a message, a code, and optional details.
type editionError struct {
	code    string
	message string
	details any
}

func (e editionError) Error() string { return e.message }

// editionFail maps an error to Node's `fail()` status/body. A malformed uuid
// (Postgres 22P02) is a 404; EditionError codes drive the rest; anything else
// is a 400.
func editionFail(err error) httpapi.Response {
	var ee editionError
	if errors.As(err, &ee) {
		status := 400
		switch ee.code {
		case "not-found":
			status = 404
		case "not-allowed":
			status = 403
		case "wrong-status", "no-slot", "ineligible":
			status = 409
		}
		return httpapi.Fail(status, ee.message, ee.details)
	}
	if isInvalidUUID(err) {
		return httpapi.Fail(404, "Not found", nil)
	}
	return httpapi.Fail(400, err.Error(), nil)
}

func isInvalidUUID(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "SQLSTATE 22P02")
}

// --- helpers ---------------------------------------------------------------

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func stringSliceOf(v any) []string {
	list, ok := v.([]any)
	if !ok {
		if ss, ok := v.([]string); ok {
			return ss
		}
		return nil
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// calendarAt reads the singleton Calendar row.
func calendarAt(ctx context.Context, q db.Querier) (map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "Calendars" LIMIT 1`)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("No calendar row: the game world has not been set up")
	}
	return m, nil
}

func seasonRow(ctx context.Context, q db.Querier, id string) (map[string]any, error) {
	rows, err := q.Query(ctx, `SELECT * FROM "Seasons" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, editionError{code: "not-found", message: fmt.Sprintf("Edition %s not found", id)}
	}
	return m, nil
}

// levelForXp ports services/world/level.ts.
func levelForXp(xp int, thresholds []any) int {
	th := make([]int, len(thresholds))
	for i, v := range thresholds {
		th[i] = intVal(v)
	}
	curve := func(level int) int { return 100 * level * level }
	xpForLevel := func(level int) int {
		n := level
		if n < 0 {
			n = 0
		}
		if n < len(th) {
			return th[n]
		}
		return curve(n)
	}
	value := xp
	if value < 0 {
		value = 0
	}
	level := 0
	for xpForLevel(level+1) <= value {
		level++
	}
	return level
}

func (r *Repository) checkDates(d EditionDates, today int) error {
	if d.RegistrationOpensDay > d.RegistrationClosesDay || d.RegistrationClosesDay > d.StartDay {
		return editionError{code: "bad-dates", message: "Dates must run registration opens <= registration closes <= start"}
	}
	if d.StartDay < today {
		return editionError{code: "bad-dates", message: "Start day is in the past"}
	}
	return nil
}

// CreateEdition ports EditionService.createEdition: a new draft edition of a
// competition, edition number = max+1.
func (r *Repository) CreateEdition(ctx context.Context, competitionID string, dates EditionDates) (map[string]any, error) {
	cal, err := calendarAt(ctx, r.q)
	if err != nil {
		return nil, err
	}
	if err := r.checkDates(dates, intVal(cal["CurrentDay"])); err != nil {
		return nil, err
	}
	var created map[string]any
	err = db.WithTx(ctx, r.q, func(tx db.Querier) error {
		compRows, err := tx.Query(ctx, `SELECT * FROM "Competitions" WHERE "_id" = $1 FOR UPDATE`, competitionID)
		if err != nil {
			return err
		}
		comp, ok, err := db.ScanOne(compRows)
		if err != nil {
			return err
		}
		if !ok {
			return editionError{code: "not-found", message: fmt.Sprintf("Competition %s not found", competitionID)}
		}
		lastRows, err := tx.Query(ctx, `SELECT COALESCE(MAX("EditionNumber"),0) AS last FROM "Seasons" WHERE "CompetitionId" = $1`, competitionID)
		if err != nil {
			return err
		}
		last, _, err := db.ScanOne(lastRows)
		if err != nil {
			return err
		}
		number := intVal(last["last"]) + 1
		code := strings.ToUpper(db.StringField(comp, "CompetitionCode")) + fmt.Sprintf("-E%d", number)
		now := time.Now()
		row, err := db.InsertRow(ctx, tx, "Seasons", map[string]any{
			"SeasonCode":            code,
			"Title":                 fmt.Sprintf("%s #%d", db.StringField(comp, "Name"), number),
			"StartDate":             now,
			"EndDate":               now,
			"CompetitionId":         db.StringField(comp, "_id"),
			"CompetitionCode":       db.StringField(comp, "CompetitionCode"),
			"EditionNumber":         number,
			"Status":                "draft",
			"RegistrationOpensDay":  dates.RegistrationOpensDay,
			"RegistrationClosesDay": dates.RegistrationClosesDay,
			"StartDay":              dates.StartDay,
			"updatedAt":             now,
		})
		if err != nil {
			return err
		}
		created = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}

// eligibilityAt ports the eligibility() predicate. Reasons are pushed in
// Node's exact order because the refusal message joins them with "; ".
func eligibilityAt(ctx context.Context, q db.Querier, seasonID, clubID string) (Eligibility, error) {
	season, err := seasonRow(ctx, q, seasonID)
	if err != nil {
		return Eligibility{}, err
	}
	cal, err := calendarAt(ctx, q)
	if err != nil {
		return Eligibility{}, err
	}
	reasons := []string{}
	def := mapOf(season["Definition"])
	var entry map[string]any
	if def != nil {
		entry = mapOf(def["Entry"])
	}
	fee := 0.0
	if entry != nil {
		fee = numVal(entry["entryFee"])
	}

	clubRows, err := q.Query(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return Eligibility{}, err
	}
	club, ok, err := db.ScanOne(clubRows)
	if err != nil {
		return Eligibility{}, err
	}
	if !ok {
		return Eligibility{}, editionError{code: "not-found", message: fmt.Sprintf("Club %s not found", clubID)}
	}
	if def == nil || entry == nil {
		return Eligibility{Eligible: false, Reasons: []string{"Not open for entry yet"}, Fee: fee}, nil
	}

	entryRows, err := q.Query(ctx, `SELECT * FROM "Entries" WHERE "SeasonId" = $1 AND "ClubId" = $2 LIMIT 1`, seasonID, clubID)
	if err != nil {
		return Eligibility{}, err
	}
	existing, hasExisting, err := db.ScanOne(entryRows)
	if err != nil {
		return Eligibility{}, err
	}
	invited := hasExisting && db.StringField(existing, "Status") == "invited"
	if hasExisting {
		s := db.StringField(existing, "Status")
		if s != "invited" && s != "withdrawn" {
			reasons = append(reasons, "Already entered")
		}
	}

	// Status and timing.
	stages := toMapList(def["Stages"])
	var firstStage map[string]any
	if len(stages) > 0 {
		firstStage = stages[0]
	}
	today := intVal(cal["CurrentDay"])
	lateOk := db.StringField(season, "Status") == "running" &&
		intVal(season["CurrentStage"]) == 0 &&
		(firstStage == nil || db.StringField(firstStage, "type") != "knockout") &&
		entry["lateEntryUntilDay"] != nil &&
		today <= intVal(season["StartDay"])+intVal(entry["lateEntryUntilDay"])
	if db.StringField(season, "Status") != "registration" && !lateOk {
		reasons = append(reasons, "Registration is closed")
	}

	// Places.
	if entry["maxClubs"] != nil {
		n, err := countAt(ctx, q, `SELECT count(*)::int AS n FROM "Entries" WHERE "SeasonId" = $1 AND "Status" = ANY($2)`, seasonID, entryHolding)
		if err != nil {
			return Eligibility{}, err
		}
		if n >= intVal(entry["maxClubs"]) {
			reasons = append(reasons, "No places left")
		}
	}

	// Invite-only.
	if db.StringField(entry, "mode") == "invite" && !invited {
		reasons = append(reasons, "Invitation only")
	}

	// Bands (skipped for invited clubs).
	if !invited {
		level := levelForXp(intVal(club["XP"]), toAnyList(cal["LevelThresholds"]))
		if entry["minLevel"] != nil && level < intVal(entry["minLevel"]) {
			reasons = append(reasons, fmt.Sprintf("Needs Level %d+", intVal(entry["minLevel"])))
		}
		if entry["maxLevel"] != nil && level > intVal(entry["maxLevel"]) {
			reasons = append(reasons, fmt.Sprintf("Only up to Level %d", intVal(entry["maxLevel"])))
		}
		if entry["minElo"] != nil && numVal(club["Elo"]) < numVal(entry["minElo"]) {
			reasons = append(reasons, fmt.Sprintf("Needs Elo %d+", intVal(entry["minElo"])))
		}
		if entry["maxElo"] != nil && numVal(club["Elo"]) > numVal(entry["maxElo"]) {
			reasons = append(reasons, fmt.Sprintf("Only up to Elo %d", intVal(entry["maxElo"])))
		}
		if entry["minRating"] != nil && numVal(club["Rating"]) < numVal(entry["minRating"]) {
			reasons = append(reasons, fmt.Sprintf("Needs rating %d+", intVal(entry["minRating"])))
		}
		if entry["maxRating"] != nil && numVal(club["Rating"]) > numVal(entry["maxRating"]) {
			reasons = append(reasons, fmt.Sprintf("Only up to rating %d", intVal(entry["maxRating"])))
		}
		countries := stringSliceOf(entry["countryIds"])
		if len(countries) > 0 && !containsString(countries, db.StringField(club, "AddressCountryId")) {
			reasons = append(reasons, "Not open to clubs from your country")
		}
		requires := stringSliceOf(entry["requiresWinOf"])
		if len(requires) > 0 {
			n, err := countAt(ctx, q, `SELECT count(*)::int AS n FROM "Seasons" WHERE "CompetitionId" = ANY($1) AND "WinnerId" = $2`, requires, clubID)
			if err != nil {
				return Eligibility{}, err
			}
			if n == 0 {
				reasons = append(reasons, "Only for past winners")
			}
		}
	}

	// Can't be in these competitions at the same time.
	excludes := stringSliceOf(entry["excludesEntrantsOf"])
	if len(excludes) > 0 {
		n, err := countAt(ctx, q, `SELECT count(*)::int AS n FROM "Entries" e
			JOIN "Seasons" s ON s."_id" = e."SeasonId"
			WHERE e."ClubId" = $1 AND e."Status" = ANY($2)
			  AND s."CompetitionId" = ANY($3) AND s."Status" = ANY($4)`,
			clubID, entryHolding, excludes, []string{"registration", "running"})
		if err != nil {
			return Eligibility{}, err
		}
		if n > 0 {
			reasons = append(reasons, "Already in a competition that excludes this one")
		}
	}

	// Barred by an outcome.
	nBars, err := countAt(ctx, q, `SELECT count(*)::int AS n FROM "CompetitionAccess"
		WHERE "ClubId" = $1 AND "CompetitionId" = $2 AND "Kind" = 'barred'
		  AND "UntilEditionNumber" >= $3`, clubID, db.StringField(season, "CompetitionId"), intVal(season["EditionNumber"]))
	if err != nil {
		return Eligibility{}, err
	}
	if nBars > 0 {
		reasons = append(reasons, "Barred from this competition for now")
	}

	// Entry cap across all competitions.
	current, err := countAt(ctx, q, `SELECT count(*)::int AS n FROM "Entries" e
		JOIN "Seasons" s ON s."_id" = e."SeasonId"
		WHERE e."ClubId" = $1 AND e."Status" = ANY($2)
		  AND s."Status" = ANY($3) AND e."SeasonId" <> $4`,
		clubID, entryHolding, []string{"registration", "running"}, seasonID)
	if err != nil {
		return Eligibility{}, err
	}
	maxConcurrent := intVal(cal["MaxConcurrentEntries"])
	if current >= maxConcurrent {
		reasons = append(reasons, fmt.Sprintf("Entry limit reached (%d / %d)", current, maxConcurrent))
	}

	// Fee.
	if fee > 0 && numVal(club["Budget"]) < fee {
		reasons = append(reasons, "Can't afford the entry fee")
	}

	return Eligibility{Eligible: len(reasons) == 0, Reasons: reasons, Fee: fee}, nil
}

// Register ports EditionService.register: serialise per edition, check
// eligibility, take the fee (guarded), upsert the entry.
func (r *Repository) Register(ctx context.Context, seasonID, clubID string) (map[string]any, error) {
	var entry map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, err := tx.Exec(ctx, `SELECT "_id" FROM "Seasons" WHERE "_id" = $1 FOR UPDATE`, seasonID); err != nil {
			return err
		}
		check, err := eligibilityAt(ctx, tx, seasonID, clubID)
		if err != nil {
			return err
		}
		if !check.Eligible {
			return editionError{code: "ineligible", message: strings.Join(check.Reasons, "; "), details: check.Reasons}
		}
		season, err := seasonRow(ctx, tx, seasonID)
		if err != nil {
			return err
		}
		if check.Fee > 0 {
			tag, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) - $2, "updatedAt" = now()
				WHERE "_id" = $1 AND coalesce("Budget",0) >= $2`, clubID, check.Fee)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return editionError{code: "ineligible", message: "Can't afford the entry fee"}
			}
			if _, err := db.InsertRow(ctx, tx, "TransferLedger", map[string]any{
				"Type": "entry_fee", "SellerClubId": clubID, "Amount": check.Fee,
				"Note": db.StringField(season, "SeasonCode") + ": entry fee", "updatedAt": time.Now(),
			}); err != nil {
				return err
			}
		}
		status := "registered"
		if db.StringField(season, "Status") == "running" {
			status = "active"
		}
		rows, err := tx.Query(ctx, `INSERT INTO "Entries" ("SeasonId","ClubId","Status","FeePaid","updatedAt")
			VALUES ($1,$2,$3,$4,now())
			ON CONFLICT ("SeasonId","ClubId") DO UPDATE SET "Status" = EXCLUDED."Status", "FeePaid" = EXCLUDED."FeePaid", "updatedAt" = now()
			RETURNING *`, seasonID, clubID, status, check.Fee)
		if err != nil {
			return err
		}
		row, ok, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("entry insert returned no row")
		}
		entry = row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return entry, nil
}

// Withdraw ports EditionService.withdraw (+ refundFees / closeOpenChallenges).
func (r *Repository) Withdraw(ctx context.Context, seasonID, clubID string) error {
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		season, err := seasonRow(ctx, tx, seasonID)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT * FROM "Entries" WHERE "SeasonId" = $1 AND "ClubId" = $2 LIMIT 1`, seasonID, clubID)
		if err != nil {
			return err
		}
		entry, ok, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		if !ok || !containsString(entryHolding, db.StringField(entry, "Status")) {
			return editionError{code: "wrong-status", message: "Club is not entered in this edition"}
		}
		switch db.StringField(season, "Status") {
		case "registration", "draft":
			if err := refundFees(ctx, tx, season, []string{clubID}); err != nil {
				return err
			}
		case "running":
			if err := closeOpenChallenges(ctx, tx, seasonID, "", clubID); err != nil {
				return err
			}
		default:
			return editionError{code: "wrong-status", message: fmt.Sprintf("Edition is %s", db.StringField(season, "Status"))}
		}
		_, err = tx.Exec(ctx, `UPDATE "Entries" SET "Status" = 'withdrawn', "updatedAt" = now() WHERE "_id" = $1`, db.StringField(entry, "_id"))
		return err
	})
}

// DeclineInvite ports EditionService.declineInvite: drop an invited row.
func (r *Repository) DeclineInvite(ctx context.Context, seasonID, clubID string) error {
	_, err := r.q.Exec(ctx, `DELETE FROM "Entries" WHERE "SeasonId" = $1 AND "ClubId" = $2 AND "Status" = 'invited'`, seasonID, clubID)
	return err
}

// refundFees returns paid entry fees to the clubs (optionally a subset).
func refundFees(ctx context.Context, q db.Querier, season map[string]any, clubIDs []string) error {
	sql := `SELECT * FROM "Entries" WHERE "SeasonId" = $1 AND "FeePaid" > 0`
	args := []any{db.StringField(season, "_id")}
	if len(clubIDs) > 0 {
		args = append(args, clubIDs)
		sql += ` AND "ClubId" = ANY($2)`
	}
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return err
	}
	paid, err := db.ScanAll(rows)
	if err != nil {
		return err
	}
	for _, entry := range paid {
		fee := numVal(entry["FeePaid"])
		if fee <= 0 {
			continue
		}
		if _, err := q.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2, "updatedAt" = now() WHERE "_id" = $1`, db.StringField(entry, "ClubId"), fee); err != nil {
			return err
		}
		if _, err := db.InsertRow(ctx, q, "TransferLedger", map[string]any{
			"Type": "entry_refund", "BuyerClubId": db.StringField(entry, "ClubId"), "Amount": fee,
			"Note": db.StringField(season, "SeasonCode") + ": entry fee refunded", "updatedAt": time.Now(),
		}); err != nil {
			return err
		}
		if _, err := q.Exec(ctx, `UPDATE "Entries" SET "FeePaid" = 0, "updatedAt" = now() WHERE "_id" = $1`, db.StringField(entry, "_id")); err != nil {
			return err
		}
	}
	return nil
}

// closeOpenChallenges expires proposed and cancels accepted, unplayed
// challenges in an edition, optionally scoped to a stage and/or a club.
func closeOpenChallenges(ctx context.Context, q db.Querier, seasonID, stageIndex, clubID string) error {
	scope := `"SeasonId" = $1 AND "Played" = false`
	args := []any{seasonID}
	if stageIndex != "" {
		args = append(args, atoiOr(stageIndex, 0))
		scope += fmt.Sprintf(` AND "StageIndex" = $%d`, len(args))
	}
	if clubID != "" {
		args = append(args, clubID)
		scope += fmt.Sprintf(` AND ("HomeTeamId" = $%d OR "AwayTeamId" = $%d)`, len(args), len(args))
	}
	if _, err := q.Exec(ctx, `UPDATE "Fixtures" SET "ChallengeStatus" = 'expired', "updatedAt" = now()
		WHERE `+scope+` AND "ChallengeStatus" = 'proposed'`, args...); err != nil {
		return err
	}
	if _, err := q.Exec(ctx, `UPDATE "Fixtures" SET "ChallengeStatus" = 'cancelled', "ScheduledDay" = NULL, "ScheduledDate" = NULL, "updatedAt" = now()
		WHERE `+scope+` AND "ChallengeStatus" = 'accepted'`, args...); err != nil {
		return err
	}
	return nil
}

// --- small query helpers ---------------------------------------------------

func countAt(ctx context.Context, q db.Querier, sql string, args ...any) (int, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return 0, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return 0, err
	}
	return intVal(m["n"]), nil
}

func toMapList(v any) []map[string]any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func toAnyList(v any) []any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	return list
}

func containsString(list []string, s string) bool {
	for _, item := range list {
		if item == s {
			return true
		}
	}
	return false
}
