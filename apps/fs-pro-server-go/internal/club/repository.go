// Package club implements the clubs.* routes and the Club repository. Reads
// use a column-keyed map passthrough (column names are the contract field
// names, `mongoId` dropped) and inject AddressCountry/Players/Manager exactly
// when the Node DrizzleClubRepository does.
package club

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Filter narrows a club list.
type Filter struct {
	UserID    string
	HasUserID bool
	Unclaimed bool
	IDs       []string
}

// ReadOptions selects which relations to inject. AddressCountry is always
// fetched, matching Node.
type ReadOptions struct {
	WithPlayersAndManager bool
}

// Repository is the pgx-backed Club store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// unmodelled are DB columns absent from Node's Drizzle `clubs` schema, so
// Drizzle never selects them - strip them to match Node's payload.
var unmodelled = []string{"LeagueCode", "LeagueId"}

func trimClub(m map[string]any) { db.Omit(m, unmodelled...) }

func trimClubs(rows []map[string]any) { db.OmitAll(rows, unmodelled...) }

// Q exposes the underlying querier (counter sequences and ad-hoc reads).
func (r *Repository) Q() db.Querier { return r.q }

// FindByID returns one club with AddressCountry (and Players/Manager when
// requested). ok is false when the id doesn't exist.
func (r *Repository) FindByID(ctx context.Context, id string, opts ReadOptions) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, false, err
	}
	club, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	if err := r.inject(ctx, []map[string]any{club}, opts); err != nil {
		return nil, false, err
	}
	return club, true, nil
}

// FindAll returns clubs matching the filter.
func (r *Repository) FindAll(ctx context.Context, f Filter, opts ReadOptions) ([]map[string]any, error) {
	conditions := make([]string, 0, 3)
	args := make([]any, 0, 3)
	if f.HasUserID {
		args = append(args, f.UserID)
		conditions = append(conditions, `"UserId" = $`+itoa(len(args)))
	}
	if f.Unclaimed {
		conditions = append(conditions, `"UserId" IS NULL`)
	}
	if len(f.IDs) > 0 {
		args = append(args, f.IDs)
		conditions = append(conditions, `"_id"::text = ANY($`+itoa(len(args))+`)`)
	}
	sql := `SELECT * FROM "Clubs"`
	if len(conditions) > 0 {
		sql += " WHERE " + joinAnd(conditions)
	}
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	clubs, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	if err := r.inject(ctx, clubs, opts); err != nil {
		return nil, err
	}
	return clubs, nil
}

// FindByUserID returns every club owned by userID with AddressCountry (the B1
// reverse-FK list). Satisfies the interface the user handlers use.
func (r *Repository) FindByUserID(ctx context.Context, userID string) ([]map[string]any, error) {
	return r.FindAll(ctx, Filter{UserID: userID, HasUserID: true}, ReadOptions{})
}

// Create inserts a club. updatedAt is set explicitly (no DB default).
func (r *Repository) Create(ctx context.Context, data map[string]any) (map[string]any, error) {
	insert := db.CopyMap(data)
	insert["updatedAt"] = time.Now()
	m, err := db.InsertRow(ctx, r.q, "Clubs", insert)
	if err != nil {
		return nil, err
	}
	trimClub(m)
	return m, nil
}

// Update writes plain fields; ok is false when the club doesn't exist.
func (r *Repository) Update(ctx context.Context, id string, data map[string]any) (map[string]any, bool, error) {
	m, err := db.UpdateRow(ctx, r.q, "Clubs", "_id", id, data, true)
	if err != nil {
		return nil, false, err
	}
	if m == nil {
		return nil, false, nil
	}
	trimClub(m)
	return m, true, nil
}

// Delete removes a club and returns the deleted row.
func (r *Repository) Delete(ctx context.Context, id string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `DELETE FROM "Clubs" WHERE "_id" = $1 RETURNING *`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return m, ok, err
	}
	trimClub(m)
	return m, true, nil
}

// SetOwner sets (or clears, with userID=="") the owner FK. Satisfies the user
// handlers' club interface.
func (r *Repository) SetOwner(ctx context.Context, id, userID string) (map[string]any, error) {
	var owner any
	if userID != "" {
		owner = userID
	}
	m, err := db.UpdateRow(ctx, r.q, "Clubs", "_id", id, map[string]any{"UserId": owner}, true)
	return m, err
}

// AppendRecord updates fields and appends one entry to the club's Records jsonb
// array in the same write, matching club.service.ts's appendClubRecord.
func (r *Repository) AppendRecord(ctx context.Context, id string, fields map[string]any, record any) (map[string]any, error) {
	current, _, err := r.FindByID(ctx, id, ReadOptions{})
	if err != nil {
		return nil, err
	}
	records := db.JSONArray(current["Records"])
	records = append(records, record)
	update := db.CopyMap(fields)
	update["Records"] = records
	m, err := db.UpdateRow(ctx, r.q, "Clubs", "_id", id, update, true)
	return m, err
}

// inject loads and attaches the relations Node's toClub attaches.
func (r *Repository) inject(ctx context.Context, clubs []map[string]any, opts ReadOptions) error {
	if len(clubs) == 0 {
		return nil
	}
	trimClubs(clubs)
	places, err := r.loadByID(ctx, "Places", db.CollectIDs(clubs, "AddressCountryId"))
	if err != nil {
		return err
	}
	if !opts.WithPlayersAndManager {
		applyClubRelations(clubs, places, nil, nil)
		return nil
	}
	clubIDs := db.CollectIDs(clubs, "_id")
	playersByClub, err := r.loadPlayersByClub(ctx, clubIDs)
	if err != nil {
		return err
	}
	managers, err := r.loadByID(ctx, "Managers", db.CollectIDs(clubs, "ManagerId"))
	if err != nil {
		return err
	}
	applyClubRelations(clubs, places, playersByClub, managers)
	return nil
}

// applyClubRelations is the pure merge step of inject, unit-testable without a
// database. AddressCountry is added when the FK resolves; Players is added as
// an (empty) array whenever playersByClub is non-nil; Manager only when the
// manager row resolves - mirroring DrizzleClubRepository.toClub.
func applyClubRelations(clubs []map[string]any, places map[string]map[string]any, playersByClub map[string][]map[string]any, managers map[string]map[string]any) {
	for _, c := range clubs {
		if id := db.StringField(c, "AddressCountryId"); id != "" {
			if p := places[id]; p != nil {
				c["AddressCountry"] = p
			}
		}
		if playersByClub != nil {
			list := playersByClub[db.StringField(c, "_id")]
			if list == nil {
				list = []map[string]any{}
			}
			c["Players"] = list
		}
		if managers != nil {
			if mid := db.StringField(c, "ManagerId"); mid != "" {
				if m := managers[mid]; m != nil {
					c["Manager"] = m
				}
			}
		}
	}
}

func (r *Repository) loadByID(ctx context.Context, table string, ids []string) (map[string]map[string]any, error) {
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

func (r *Repository) loadPlayersByClub(ctx context.Context, clubIDs []string) (map[string][]map[string]any, error) {
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
		clubID := db.StringField(p, "ClubId")
		out[clubID] = append(out[clubID], p)
	}
	return out, nil
}
