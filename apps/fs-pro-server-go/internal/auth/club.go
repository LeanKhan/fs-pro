package auth

import (
	"context"

	"fs-pro-server/internal/db"
)

// ClubStore is the small club surface the user routes need. The richer club
// read (Players/Manager relations) lives in internal/club; this interface only
// covers the reverse-FK owner list and the owner FK write.
type ClubStore interface {
	FindByUserID(ctx context.Context, userID string) ([]map[string]any, error)
	Update(ctx context.Context, id string, data map[string]any) (map[string]any, error)
	SetOwner(ctx context.Context, id, userID string) (map[string]any, error)
}

// PgClubStore reads/writes the "Clubs" table for the user routes.
type PgClubStore struct {
	q db.Querier
}

// NewPgClubStore wraps a Querier.
func NewPgClubStore(q db.Querier) *PgClubStore { return &PgClubStore{q: q} }

// FindByUserID returns every club owned by userID, injecting AddressCountry
// (the relation Node's ClubRepository always fetches), matching D4.
func (s *PgClubStore) FindByUserID(ctx context.Context, userID string) ([]map[string]any, error) {
	rows, err := s.q.Query(ctx, `SELECT * FROM "Clubs" WHERE "UserId" = $1`, userID)
	if err != nil {
		return nil, err
	}
	clubs, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	if err := injectAddressCountry(ctx, s.q, clubs); err != nil {
		return nil, err
	}
	return clubs, nil
}

// Update writes plain club fields, refreshing updatedAt. Missing -> (nil,nil).
func (s *PgClubStore) Update(ctx context.Context, id string, data map[string]any) (map[string]any, error) {
	return db.UpdateRow(ctx, s.q, "Clubs", "_id", id, data, true)
}

// SetOwner sets (or clears, with userID=="") the club's UserId FK.
func (s *PgClubStore) SetOwner(ctx context.Context, id, userID string) (map[string]any, error) {
	var owner any
	if userID != "" {
		owner = userID
	}
	return db.UpdateRow(ctx, s.q, "Clubs", "_id", id, map[string]any{"UserId": owner}, true)
}

func injectAddressCountry(ctx context.Context, q db.Querier, clubs []map[string]any) error {
	ids := db.CollectIDs(clubs, "AddressCountryId")
	if len(ids) == 0 {
		return nil
	}
	rows, err := q.Query(ctx, `SELECT * FROM "Places" WHERE "_id"::text = ANY($1)`, ids)
	if err != nil {
		return err
	}
	places, err := db.ScanAll(rows)
	if err != nil {
		return err
	}
	mergeAddressCountry(clubs, places)
	return nil
}

// mergeAddressCountry attaches AddressCountry to each club whose FK resolves to
// a fetched place, and leaves it absent otherwise (matching Node's
// `...(addressCountry ? {...} : {})`). Pure so it is unit-testable.
func mergeAddressCountry(clubs, places []map[string]any) {
	byID := make(map[string]map[string]any, len(places))
	for _, p := range places {
		byID[db.StringField(p, "_id")] = p
	}
	for _, c := range clubs {
		if id := db.StringField(c, "AddressCountryId"); id != "" {
			if p := byID[id]; p != nil {
				c["AddressCountry"] = p
			}
		}
	}
}
