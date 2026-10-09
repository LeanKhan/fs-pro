// Package fixture implements the fixtures.* routes, mirroring
// DrizzleFixtureRepository's relation injection (side details always; teams
// only for the single-fixture read) and the `light` read that skips stats.
package fixture

import (
	"context"
	"strconv"
	"strings"
	"time"

	"fs-pro-server/internal/db"
)

// Filter narrows a fixture list.
type Filter struct {
	SeasonID         string
	HasSeason        bool
	Played           bool
	HasPlayed        bool
	ScheduledDay     int
	HasScheduledDay  bool
	ScheduledFrom    int
	HasScheduledFrom bool
	ScheduledTo      int
	HasScheduledTo   bool
	Club             string
	HasClub          bool
}

// ReadOptions selects relations.
type ReadOptions struct {
	Light    bool
	WithClub bool
}

// Repository is the pgx-backed Fixture store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier for cross-domain reads (replays, inbox, etc.).
func (r *Repository) Q() db.Querier { return r.q }

// fixtureUnmodelled are DB columns absent from Node's Drizzle `fixtures`
// schema; clubUnmodelled are the same for the embedded HomeTeam/AwayTeam.
var (
	fixtureUnmodelled = []string{"Week"}
	clubUnmodelled    = []string{"LeagueCode", "LeagueId"}
)

// ScheduleSummary is GET /fixtures/schedule-summary's payload.
type ScheduleSummary struct {
	FirstDay *int `json:"firstDay"`
	LastDay  *int `json:"lastDay"`
	Total    int  `json:"total"`
	Played   int  `json:"played"`
}

// FindByID returns one fixture with side details (and clubs when requested).
func (r *Repository) FindByID(ctx context.Context, id string, opts ReadOptions) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Fixtures" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, false, err
	}
	f, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	if err := r.inject(ctx, []map[string]any{f}, opts); err != nil {
		return nil, false, err
	}
	return f, true, nil
}

// FindAll returns fixtures matching the filter.
func (r *Repository) FindAll(ctx context.Context, f Filter, opts ReadOptions) ([]map[string]any, error) {
	conditions := make([]string, 0, 6)
	args := make([]any, 0, 6)
	add := func(cond string, value any) {
		args = append(args, value)
		conditions = append(conditions, cond+"$"+strconv.Itoa(len(args)))
	}
	if f.HasSeason {
		add(`"SeasonId" = `, f.SeasonID)
	}
	if f.HasPlayed {
		add(`"Played" = `, f.Played)
	}
	if f.HasScheduledDay {
		add(`"ScheduledDay" = `, f.ScheduledDay)
	}
	if f.HasScheduledFrom {
		add(`"ScheduledDay" >= `, f.ScheduledFrom)
	}
	if f.HasScheduledTo {
		add(`"ScheduledDay" <= `, f.ScheduledTo)
	}
	if f.HasClub {
		args = append(args, f.Club, f.Club)
		conditions = append(conditions, `("Home" = $`+strconv.Itoa(len(args)-1)+` OR "Away" = $`+strconv.Itoa(len(args))+`)`)
	}
	sql := `SELECT * FROM "Fixtures"`
	if len(conditions) > 0 {
		sql += " WHERE " + strings.Join(conditions, " AND ")
	}
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	fixtures, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	if err := r.inject(ctx, fixtures, opts); err != nil {
		return nil, err
	}
	return fixtures, nil
}

// Summary returns first/last scheduled day and total/played counts.
func (r *Repository) Summary(ctx context.Context) (ScheduleSummary, error) {
	out := ScheduleSummary{}
	var first, last *int
	if err := r.q.QueryRow(ctx,
		`SELECT min("ScheduledDay"), max("ScheduledDay"), count(*) FROM "Fixtures" WHERE "ScheduledDay" IS NOT NULL`).
		Scan(&first, &last, &out.Total); err != nil {
		return out, err
	}
	out.FirstDay, out.LastDay = first, last
	if err := r.q.QueryRow(ctx,
		`SELECT count(*) FROM "Fixtures" WHERE "ScheduledDay" IS NOT NULL AND "Played" = true`).
		Scan(&out.Played); err != nil {
		return out, err
	}
	return out, nil
}

// Delete removes a fixture, returning ok=false when it doesn't exist.
func (r *Repository) Delete(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `DELETE FROM "Fixtures" WHERE "_id" = $1 RETURNING *`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return m, ok, err
	}
	db.Omit(m, fixtureUnmodelled...)
	return m, true, nil
}

// Create inserts a fixture and returns it (used by game.createFriendly).
func (r *Repository) Create(ctx context.Context, data map[string]any) (map[string]any, error) {
	insert := db.CopyMap(data)
	insert["updatedAt"] = time.Now()
	m, err := db.InsertRow(ctx, r.q, "Fixtures", insert)
	if err != nil {
		return nil, err
	}
	db.Omit(m, fixtureUnmodelled...)
	return m, nil
}

func (r *Repository) inject(ctx context.Context, fixtures []map[string]any, opts ReadOptions) error {
	if len(fixtures) == 0 {
		return nil
	}
	db.OmitAll(fixtures, fixtureUnmodelled...)
	if opts.Light {
		return nil
	}
	sideIDs := append(db.CollectIDs(fixtures, "HomeSideDetailsId"), db.CollectIDs(fixtures, "AwaySideDetailsId")...)
	sides, err := r.loadSides(ctx, sideIDs)
	if err != nil {
		return err
	}
	var clubs map[string]map[string]any
	if opts.WithClub {
		if clubs, err = r.loadEmbeddedClubs(ctx, fixtures); err != nil {
			return err
		}
	}
	for _, f := range fixtures {
		if opts.WithClub {
			if id := db.StringField(f, "HomeTeamId"); id != "" {
				if c := clubs[id]; c != nil {
					f["HomeTeam"] = c
				}
			}
			if id := db.StringField(f, "AwayTeamId"); id != "" {
				if c := clubs[id]; c != nil {
					f["AwayTeam"] = c
				}
			}
		}
		if id := db.StringField(f, "HomeSideDetailsId"); id != "" {
			if s := sides[id]; s != nil {
				f["HomeSideDetails"] = s
			}
		}
		if id := db.StringField(f, "AwaySideDetailsId"); id != "" {
			if s := sides[id]; s != nil {
				f["AwaySideDetails"] = s
			}
		}
	}
	return nil
}

// loadSides loads ClubMatchDetails rows (keyed by id) with their PlayerStats.
func (r *Repository) loadSides(ctx context.Context, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "ClubMatchDetails" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	stats, err := r.loadPlayerStats(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, s := range list {
		id := db.StringField(s, "_id")
		list := stats[id]
		if list == nil {
			list = []map[string]any{}
		}
		s["PlayerStats"] = list
		out[id] = s
	}
	return out, nil
}

func (r *Repository) loadPlayerStats(ctx context.Context, sideIDs []string) (map[string][]map[string]any, error) {
	out := map[string][]map[string]any{}
	rows, err := r.q.Query(ctx, `SELECT * FROM "PlayerMatchDetails" WHERE "ClubMatchDetailsId"::text = ANY($1)`, sideIDs)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, st := range list {
		side := db.StringField(st, "ClubMatchDetailsId")
		out[side] = append(out[side], st)
	}
	return out, nil
}

// loadEmbeddedClubs loads HomeTeam/AwayTeam clubs with Players + Manager (no
// AddressCountry - mirrors FixtureRepository's toEmbeddedClub).
func (r *Repository) loadEmbeddedClubs(ctx context.Context, fixtures []map[string]any) (map[string]map[string]any, error) {
	ids := append(db.CollectIDs(fixtures, "HomeTeamId"), db.CollectIDs(fixtures, "AwayTeamId")...)
	if len(ids) == 0 {
		return map[string]map[string]any{}, nil
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "Clubs" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	clubs, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	players, err := r.playersByClub(ctx, ids)
	if err != nil {
		return nil, err
	}
	managers, err := r.loadByIDs(ctx, "Managers", db.CollectIDs(clubs, "ManagerId"))
	if err != nil {
		return nil, err
	}
	out := make(map[string]map[string]any, len(clubs))
	for _, c := range clubs {
		db.Omit(c, clubUnmodelled...)
		id := db.StringField(c, "_id")
		list := players[id]
		if list == nil {
			list = []map[string]any{}
		}
		c["Players"] = list
		if mid := db.StringField(c, "ManagerId"); mid != "" {
			if m := managers[mid]; m != nil {
				c["Manager"] = m
			}
		}
		out[id] = c
	}
	return out, nil
}

func (r *Repository) playersByClub(ctx context.Context, clubIDs []string) (map[string][]map[string]any, error) {
	out := map[string][]map[string]any{}
	if len(clubIDs) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "Players" WHERE "ClubId"::text = ANY($1)`, clubIDs)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, p := range list {
		club := db.StringField(p, "ClubId")
		out[club] = append(out[club], p)
	}
	return out, nil
}

func (r *Repository) loadByIDs(ctx context.Context, table string, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "`+table+`" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, m := range list {
		out[db.StringField(m, "_id")] = m
	}
	return out, nil
}
