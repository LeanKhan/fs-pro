package league

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/loot"
)

// Repository is the Postgres-backed Standing-ladder store (docs/coc-mapping/04
// §4-§5, 05 §8 "Ladder"). Reads use the column-keyed map passthrough; every
// mutation runs inside the caller's transaction so the raid/rollover guards
// keep it once-only.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

// Sentinel errors the handlers map to HTTP statuses.
var (
	ErrClubNotFound = errors.New("club not found")
	ErrNotSignedUp  = errors.New("not signed up for the weekly ladder")
	ErrNotRanked    = errors.New("reach Bronze III to join the weekly ladder")
)

// --- Standing --------------------------------------------------------------

// Standing returns the club's Standing read model (04 §4.1, §4.2): points,
// league code/division, the loot multiplier (x100) and its global ladder rank.
func (r *Repository) Standing(ctx context.Context, clubID string) (map[string]any, bool, error) {
	row, ok, err := one(ctx, r.q, `SELECT "_id","StandingPoints" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	points := intOf(row["StandingPoints"])
	l := LeagueFor(points)
	observeStanding(points, l.Code())
	rankRow, _, err := one(ctx, r.q, `SELECT count(*)::int AS n FROM "Clubs" WHERE "ReleasedAt" IS NULL AND "StandingPoints" > $1`, points)
	if err != nil {
		return nil, false, err
	}
	rank := intOf(rankRow["n"]) + 1
	return map[string]any{
		"clubId":         db.StringField(row, "_id"),
		"points":         points,
		"leagueCode":     l.Code(),
		"division":       l.Division,
		"multiplierX100": multiplierX100(l),
		"rank":           rank,
	}, true, nil
}

// --- weekly pool -----------------------------------------------------------

// Pool returns the club's weekly tournament pool (04 §4.3) for the current
// week, or (nil, false, nil) when the club is not signed up this week.
func (r *Repository) Pool(ctx context.Context, clubID string, now time.Time) (map[string]any, bool, error) {
	exists, ok, err := one(ctx, r.q, `SELECT "_id","StandingPoints" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil || !ok {
		return nil, ok, err
	}
	row, ok, err := one(ctx, r.q, `SELECT * FROM "StandingPools" WHERE "ClubId" = $1 AND "WeekKey" = $2`, clubID, WeekKey(now))
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}
	return poolPayload(row, intOf(exists["StandingPoints"])), true, nil
}

// Signup joins the club to its league's weekly pool. It is idempotent: a second
// signup in the same week returns the stored pool (the (WeekKey, ClubId) unique
// key). A club below Bronze III is refused until it is ranked (04 §4.2).
func (r *Repository) Signup(ctx context.Context, clubID string, now time.Time) (map[string]any, error) {
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		club, ok, err := one(ctx, tx, `SELECT "_id","StandingPoints" FROM "Clubs" WHERE "_id" = $1 FOR UPDATE`, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrClubNotFound
		}
		points := intOf(club["StandingPoints"])
		index := LeagueIndex(points)
		if index < 0 {
			return ErrNotRanked
		}
		code := Leagues[index].Code()
		week := WeekKey(now)

		if row, ok, err := one(ctx, tx, `SELECT * FROM "StandingPools" WHERE "WeekKey" = $1 AND "ClubId" = $2`, week, clubID); err != nil {
			return err
		} else if ok {
			out = poolPayload(row, points)
			return nil
		}

		fill, err := poolFill(ctx, tx, week, code)
		if err != nil {
			return err
		}
		pool := NextPoolIndex(fill)
		if _, err := tx.Exec(ctx, `INSERT INTO "StandingPools" ("LeagueCode","WeekKey","ClubId","Pool","Attacks","Defenses","Stars","updatedAt")
			VALUES ($1,$2,$3,$4,0,0,0,now())
			ON CONFLICT ("WeekKey","ClubId") DO NOTHING`, code, week, clubID, pool); err != nil {
			return err
		}
		row, ok, err := one(ctx, tx, `SELECT * FROM "StandingPools" WHERE "WeekKey" = $1 AND "ClubId" = $2`, week, clubID)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("signup: pool row missing after insert")
		}
		out = poolPayload(row, points)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// poolFill is the current member count per existing pool for a week+league,
// indexed densely from pool 0.
func poolFill(ctx context.Context, q db.Querier, week, code string) ([]int, error) {
	rows, err := q.Query(ctx, `SELECT "Pool", count(*)::int AS n FROM "StandingPools"
		WHERE "WeekKey" = $1 AND "LeagueCode" = $2 GROUP BY "Pool"`, week, code)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	maxPool := -1
	counts := map[int]int{}
	for _, row := range list {
		p := intOf(row["Pool"])
		counts[p] = intOf(row["n"])
		if p > maxPool {
			maxPool = p
		}
	}
	fill := make([]int, maxPool+1)
	for p, n := range counts {
		fill[p] = n
	}
	return fill, nil
}

func poolPayload(row map[string]any, points int) map[string]any {
	index := LeagueByCode(db.StringField(row, "LeagueCode"))
	var placement any
	if row["Placement"] != nil {
		placement = intOf(row["Placement"])
	}
	return map[string]any{
		"weekKey":         db.StringField(row, "WeekKey"),
		"leagueCode":      db.StringField(row, "LeagueCode"),
		"pool":            intOf(row["Pool"]),
		"attacks":         intOf(row["Attacks"]),
		"attacksAllowed":  AttacksPerPool(index),
		"defenses":        intOf(row["Defenses"]),
		"stars":           intOf(row["Stars"]),
		"placement":       placement,
		"currentStanding": points,
	}
}

// --- Form Bonus ------------------------------------------------------------

// FormBonusState returns the club's rolling Form Bonus window (04 §5.3).
func (r *Repository) FormBonusState(ctx context.Context, clubID string, now time.Time) (map[string]any, bool, error) {
	if _, ok, err := one(ctx, r.q, `SELECT "_id" FROM "Clubs" WHERE "_id" = $1`, clubID); err != nil || !ok {
		return nil, ok, err
	}
	row, ok, err := one(ctx, r.q, `SELECT * FROM "FormBonus" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, false, err
	}
	fb := FormBonus{}
	if ok {
		fb = decodeFormBonus(row)
	}
	var nextReset any
	if t := fb.NextResetAt(now); t != nil {
		nextReset = db.ISO8601msUTC(*t)
	}
	return map[string]any{
		"stars":       fb.Stars(now),
		"required":    FormBonusStars,
		"ready":       fb.Ready(),
		"nextResetAt": nextReset,
	}, true, nil
}

// AccrueFormBonus adds one raid's stars to the club's rolling window and, when
// the window completes, credits the Form Bonus loot into the Board Vault and
// marks the bonus ready for the player (04 §5.3). It is idempotent per raidID
// (dedupe in FormBonus.Accrue). It must run inside the caller's transaction
// (the raid's once-only guard).
func AccrueFormBonus(ctx context.Context, q db.Querier, clubID, raidID string, stars int, now time.Time) (earned bool, credited int, err error) {
	row, ok, err := one(ctx, q, `SELECT * FROM "FormBonus" WHERE "ClubId" = $1 FOR UPDATE`, clubID)
	if err != nil {
		return false, 0, err
	}
	fb := FormBonus{}
	if ok {
		fb = decodeFormBonus(row)
	}
	next, earned := fb.Accrue(raidID, now, stars)
	if earned {
		credited, err = creditFormBonus(ctx, q, clubID, now)
		if err != nil {
			return false, 0, err
		}
		next.Credited = credited
	}
	if err := upsertFormBonus(ctx, q, clubID, next); err != nil {
		return false, 0, err
	}
	return earned, credited, nil
}

// creditFormBonus banks the league-scaled Form Bonus into the Board Vault
// (capped by capacity) with a ledger row, and returns the amount credited.
func creditFormBonus(ctx context.Context, q db.Querier, clubID string, now time.Time) (int, error) {
	club, ok, err := one(ctx, q, `SELECT "StandingPoints","ClubhouseTier" FROM "Clubs" WHERE "_id" = $1`, clubID)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, ErrClubNotFound
	}
	base := FormBonusLoot(multiplierX100(LeagueFor(intOf(club["StandingPoints"]))))
	if base <= 0 {
		return 0, nil
	}
	vault, ok, err := one(ctx, q, `SELECT "Balance" FROM "BoardVault" WHERE "ClubId" = $1 FOR UPDATE`, clubID)
	if err != nil {
		return 0, err
	}
	existing := 0
	if ok {
		existing = intOf(vault["Balance"])
	}
	capacity := loot.BoardVaultCapacity(intOf(club["ClubhouseTier"]))
	credited := base
	if existing+credited > capacity {
		credited = capacity - existing
	}
	if credited <= 0 {
		return 0, nil
	}
	if _, err := q.Exec(ctx, `INSERT INTO "BoardVault" ("ClubId","Balance","updatedAt") VALUES ($1,$2,now())
		ON CONFLICT ("ClubId") DO UPDATE SET "Balance" = $2, "updatedAt" = now()`, clubID, existing+credited); err != nil {
		return 0, err
	}
	if _, err := db.InsertRow(ctx, q, "TransferLedger", map[string]any{
		"Type": "form_bonus", "BuyerClubId": clubID, "Amount": float64(credited),
		"Note": "Form Bonus (" + strconv.Itoa(FormBonusStars) + " stars)", "updatedAt": now,
	}); err != nil {
		return 0, err
	}
	return credited, nil
}

// ClearFormBonusEarned consumes the "ready" flag once the club's Board Vault —
// which holds the credited Form Bonus loot — has been claimed via
// play.claimBoardVault (04 §5.2, §5.3).
func ClearFormBonusEarned(ctx context.Context, q db.Querier, clubID string) error {
	_, err := q.Exec(ctx, `UPDATE "FormBonus" SET "EarnedAt" = NULL, "updatedAt" = now()
		WHERE "ClubId" = $1 AND "EarnedAt" IS NOT NULL`, clubID)
	return err
}

func upsertFormBonus(ctx context.Context, q db.Querier, clubID string, fb FormBonus) error {
	entries := fb.Entries
	if entries == nil {
		entries = []FormBonusEntry{} // store [] not null so the column always reads back as a list
	}
	raw, err := json.Marshal(entries)
	if err != nil {
		return err
	}
	var earned any
	if fb.EarnedAt != nil {
		earned = *fb.EarnedAt
	}
	_, err = q.Exec(ctx, `INSERT INTO "FormBonus" ("ClubId","Entries","EarnedAt","Credited","updatedAt")
		VALUES ($1,$2::jsonb,$3,$4,now())
		ON CONFLICT ("ClubId") DO UPDATE SET "Entries" = EXCLUDED."Entries", "EarnedAt" = EXCLUDED."EarnedAt",
		  "Credited" = EXCLUDED."Credited", "updatedAt" = now()`, clubID, string(raw), earned, fb.Credited)
	return err
}

func decodeFormBonus(row map[string]any) FormBonus {
	fb := FormBonus{Credited: intOf(row["Credited"])}
	switch v := row["Entries"].(type) {
	case []any:
		for _, raw := range v {
			m, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			at, ok := parseTime(db.StringField(m, "at"))
			if !ok {
				continue
			}
			fb.Entries = append(fb.Entries, FormBonusEntry{
				RaidID: db.StringField(m, "raidId"), At: at, Stars: intOf(m["stars"]),
			})
		}
	case string:
		var entries []FormBonusEntry
		if err := json.Unmarshal([]byte(v), &entries); err == nil {
			fb.Entries = entries
		}
	}
	if t, ok := parseTime(db.StringField(row, "EarnedAt")); ok {
		fb.EarnedAt = &t
	}
	return fb
}

// --- ranked-raid hook (P5 extension) ---------------------------------------

// RecordRankedRaid accrues one resolved ranked raid onto the weekly ladder:
// the attacker's Form Bonus window plus the attacker/defender pool counters
// (04 §4.3, §5.3). It runs inside the raid's transaction, after the once-only
// RaidResults guard, so a crash-and-retry cannot double-apply.
func RecordRankedRaid(ctx context.Context, q db.Querier, raidID, attackerID, defenderID string, stars int, now time.Time) error {
	if _, _, err := AccrueFormBonus(ctx, q, attackerID, raidID, stars, now); err != nil {
		return err
	}
	week := WeekKey(now)
	if _, err := q.Exec(ctx, `UPDATE "StandingPools" SET "Attacks" = "Attacks" + 1, "Stars" = "Stars" + $3, "updatedAt" = now()
		WHERE "WeekKey" = $1 AND "ClubId" = $2`, week, attackerID, stars); err != nil {
		return err
	}
	if _, err := q.Exec(ctx, `UPDATE "StandingPools" SET "Defenses" = "Defenses" + 1, "updatedAt" = now()
		WHERE "WeekKey" = $1 AND "ClubId" = $2`, week, defenderID); err != nil {
		return err
	}
	return nil
}

// --- rollover (world-worker) -----------------------------------------------

// RolloverReport is the count of clubs moved by one rollover tick.
type RolloverReport struct {
	Weekly  int
	Monthly int
}

// Rollover settles every closed week and the previous month's apex resets
// (04 §4.3). It is idempotent: every Standing change is anchored by the
// once-only StandingResults row for (WeekKey, ClubId), so a repeated tick
// applies nothing. It runs inside the worker registry's transaction.
func Rollover(ctx context.Context, q db.Querier, now time.Time) (RolloverReport, error) {
	var rep RolloverReport
	apexCode := Leagues[ApexIndex()].Code()

	weeks, err := scanAll(ctx, q, `SELECT DISTINCT "WeekKey" FROM "StandingPools"
		WHERE "WeekKey" < $1 ORDER BY "WeekKey"`, WeekKey(now))
	if err != nil {
		return rep, err
	}
	for _, w := range weeks {
		week := db.StringField(w, "WeekKey")
		rows, err := scanAll(ctx, q, `SELECT p."ClubId", p."Pool", p."LeagueCode", p."Stars", c."StandingPoints"
			FROM "StandingPools" p JOIN "Clubs" c ON c."_id" = p."ClubId"
			WHERE p."WeekKey" = $1 AND p."LeagueCode" <> $2`, week, apexCode)
		if err != nil {
			return rep, err
		}
		n, err := settleWeek(ctx, q, week, rows)
		if err != nil {
			return rep, err
		}
		rep.Weekly += n
	}

	apex, err := scanAll(ctx, q, `SELECT DISTINCT p."ClubId", c."StandingPoints"
		FROM "StandingPools" p JOIN "Clubs" c ON c."_id" = p."ClubId"
		WHERE p."LeagueCode" = $1 ORDER BY p."ClubId"`, apexCode)
	if err != nil {
		return rep, err
	}
	rep.Monthly, err = settleApex(ctx, q, PreviousMonthKey(now), apex)
	if err != nil {
		return rep, err
	}
	return rep, nil
}

// settleWeek applies one closed week's promotion/relegation, resets the moved
// clubs' Standing to their new rung floor, and returns how many were settled.
func settleWeek(ctx context.Context, q db.Querier, week string, rows []map[string]any) (int, error) {
	groups := map[string][]map[string]any{}
	for _, row := range rows {
		key := db.StringField(row, "LeagueCode") + "#" + strconv.Itoa(intOf(row["Pool"]))
		groups[key] = append(groups[key], row)
	}
	keys := make([]string, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	settled := 0
	for _, key := range keys {
		group := groups[key]
		entries := make([]PoolEntry, len(group))
		for i, row := range group {
			entries[i] = PoolEntry{ClubID: db.StringField(row, "ClubId"), Stars: intOf(row["Stars"])}
		}
		placements := Placement(entries)
		index := LeagueByCode(db.StringField(group[0], "LeagueCode"))
		for _, row := range group {
			clubID := db.StringField(row, "ClubId")
			oldStanding := intOf(row["StandingPoints"])
			newIndex, outcome := PlacementOutcome(index, placements[clubID], len(group))
			newStanding := ResetFloor(newIndex)
			tag, err := q.Exec(ctx, `INSERT INTO "StandingResults" ("ClubId","WeekKey","LeagueCode","Delta","Standing","Outcome","updatedAt")
				VALUES ($1,$2,$3,$4,$5,$6,now())
				ON CONFLICT ("WeekKey","ClubId") DO NOTHING`,
				clubID, week, db.StringField(row, "LeagueCode"), newStanding-oldStanding, newStanding, outcome)
			if err != nil {
				return settled, err
			}
			if tag.RowsAffected() == 0 {
				continue // already settled by an earlier tick
			}
			if _, err := q.Exec(ctx, `UPDATE "StandingPools" SET "Placement" = $3, "updatedAt" = now()
				WHERE "WeekKey" = $1 AND "ClubId" = $2`, week, clubID, placements[clubID]); err != nil {
				return settled, err
			}
			if _, err := q.Exec(ctx, `UPDATE "Clubs" SET "StandingPoints" = $2, "updatedAt" = now() WHERE "_id" = $1`,
				clubID, newStanding); err != nil {
				return settled, err
			}
			settled++
		}
	}
	return settled, nil
}

// settleApex resets the apex clubs' Standing to the apex floor once per month,
// keyed by the previous month so the guard is distinct from the weekly keys.
func settleApex(ctx context.Context, q db.Querier, monthKey string, rows []map[string]any) (int, error) {
	floor := ResetFloor(ApexIndex())
	apexCode := Leagues[ApexIndex()].Code()
	settled := 0
	for _, row := range rows {
		clubID := db.StringField(row, "ClubId")
		oldStanding := intOf(row["StandingPoints"])
		tag, err := q.Exec(ctx, `INSERT INTO "StandingResults" ("ClubId","WeekKey","LeagueCode","Delta","Standing","Outcome","updatedAt")
			VALUES ($1,$2,$3,$4,$5,'monthly_reset',now())
			ON CONFLICT ("WeekKey","ClubId") DO NOTHING`,
			clubID, monthKey, apexCode, floor-oldStanding, floor)
		if err != nil {
			return settled, err
		}
		if tag.RowsAffected() == 0 {
			continue
		}
		if _, err := q.Exec(ctx, `UPDATE "Clubs" SET "StandingPoints" = $2, "updatedAt" = now() WHERE "_id" = $1`, clubID, floor); err != nil {
			return settled, err
		}
		settled++
	}
	return settled, nil
}

// --- helpers ---------------------------------------------------------------

func multiplierX100(l League) int { return int(l.Multiplier*100 + 0.5) }

func one(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func scanAll(ctx context.Context, q db.Querier, sql string, args ...any) ([]map[string]any, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return db.ScanAll(rows)
}

func parseTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{"2006-01-02T15:04:05.000Z", "2006-01-02T15:04:05Z", time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}
