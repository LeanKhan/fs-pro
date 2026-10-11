package player

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Filter narrows a player list.
type Filter struct {
	ClubID      string
	HasClubID   bool
	ClubCode    string
	HasClubCode bool
	IsSigned    bool
	HasIsSigned bool
	ExcludeClub string
	HasExclude  bool
	// IncludeRetired, when false, excludes retired players (the default on
	// every active read).
	IncludeRetired bool
}

// Repository is the pgx-backed Player store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the underlying querier (used for counter sequences).
func (r *Repository) Q() db.Querier { return r.q }

// FindByID returns one player, optionally with Nationality injected.
func (r *Repository) FindByID(ctx context.Context, id string, withNationality bool) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Players" WHERE "_id" = $1 LIMIT 1`, id)
	if err != nil {
		return nil, false, err
	}
	p, ok, err := db.ScanOne(rows)
	if err != nil || !ok {
		return nil, false, err
	}
	if withNationality {
		if err := r.injectNationality(ctx, []map[string]any{p}); err != nil {
			return nil, false, err
		}
	}
	return p, true, nil
}

// FindAll returns players matching the filter.
func (r *Repository) FindAll(ctx context.Context, f Filter, withNationality bool) ([]map[string]any, error) {
	where, args := playerWhere(f)
	sql := `SELECT * FROM "Players"`
	if where != "" {
		sql += " WHERE " + where
	}
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	if withNationality {
		if err := r.injectNationality(ctx, list); err != nil {
			return nil, err
		}
	}
	return list, nil
}

// playerWhere builds the WHERE clause and bind args for a filter. Pure so the
// SQL shape (e.g. `<>` for excludeClubId) is unit-testable.
func playerWhere(f Filter) (string, []any) {
	conditions := make([]string, 0, 5)
	args := make([]any, 0, 5)
	add := func(cond string, value any) {
		args = append(args, value)
		conditions = append(conditions, cond+"$"+itoa(len(args)))
	}
	if f.HasClubID {
		add(`"ClubId" = `, f.ClubID)
	}
	if f.HasClubCode {
		add(`"ClubCode" = `, f.ClubCode)
	}
	if f.HasIsSigned {
		add(`"isSigned" = `, f.IsSigned)
	}
	if f.HasExclude {
		// Node uses ne() (`<>`), which excludes NULL ClubId rows too.
		add(`"ClubId" <> `, f.ExcludeClub)
	}
	if !f.IncludeRetired {
		conditions = append(conditions, `"isRetired" = false`)
	}
	return joinAnd(conditions), args
}

func (r *Repository) injectNationality(ctx context.Context, players []map[string]any) error {
	ids := db.CollectIDs(players, "NationalityId")
	places, err := r.loadPlaces(ctx, ids)
	if err != nil {
		return err
	}
	for _, p := range players {
		if id := db.StringField(p, "NationalityId"); id != "" {
			if place := places[id]; place != nil {
				p["Nationality"] = place
			}
		}
	}
	return nil
}

func (r *Repository) loadPlaces(ctx context.Context, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "Places" WHERE "_id"::text = ANY($1)`, ids)
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

// Create inserts a player (updatedAt set explicitly).
func (r *Repository) Create(ctx context.Context, data map[string]any) (map[string]any, error) {
	insert := db.CopyMap(data)
	insert["updatedAt"] = time.Now()
	return db.InsertRow(ctx, r.q, "Players", insert)
}

// Update writes plain fields; ok is false when the player doesn't exist.
func (r *Repository) Update(ctx context.Context, id string, data map[string]any) (map[string]any, bool, error) {
	m, err := db.UpdateRow(ctx, r.q, "Players", "_id", id, data, true)
	if err != nil {
		return nil, false, err
	}
	return m, m != nil, nil
}

// UpdateManyByIds writes the same fields to many players.
func (r *Repository) UpdateManyByIds(ctx context.Context, ids []string, data map[string]any) error {
	if len(ids) == 0 {
		return nil
	}
	update := db.CopyMap(data)
	update["updatedAt"] = time.Now()
	_, err := r.q.Exec(ctx, `UPDATE "Players" SET "isSigned" = $2, "ClubCode" = $3, "ClubId" = $4, "updatedAt" = now()
		WHERE "_id"::text = ANY($1)`,
		ids, update["isSigned"], update["ClubCode"], update["ClubId"])
	return err
}

// Delete removes the player's match stats first (no cascade), then the player.
func (r *Repository) Delete(ctx context.Context, id string) (map[string]any, bool, error) {
	if _, err := r.q.Exec(ctx, `DELETE FROM "PlayerMatchDetails" WHERE "PlayerId" = $1`, id); err != nil {
		return nil, false, err
	}
	rows, err := r.q.Query(ctx, `DELETE FROM "Players" WHERE "_id" = $1 RETURNING *`, id)
	if err != nil {
		return nil, false, err
	}
	m, ok, err := db.ScanOne(rows)
	return m, ok, err
}

// ToggleSigned mirrors player.service.ts's toggleSigned: it *sets* isSigned to
// !currentSigned (callers pass the current value) and writes the club fields.
func (r *Repository) ToggleSigned(ctx context.Context, playerID string, currentSigned bool, clubCode, clubID any) (map[string]any, error) {
	m, _, err := r.Update(ctx, playerID, map[string]any{
		"isSigned": !currentSigned,
		"ClubCode": clubCode,
		"ClubId":   clubID,
	})
	return m, err
}

// SignMany mirrors signManyPlayersToClub: isSigned=true plus the club fields.
func (r *Repository) SignMany(ctx context.Context, ids []string, clubCode, clubID string) error {
	return r.UpdateManyByIds(ctx, ids, map[string]any{
		"isSigned": true,
		"ClubCode": clubCode,
		"ClubId":   clubID,
	})
}
