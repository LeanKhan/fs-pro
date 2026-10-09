// Package atlas implements the atlas.* routes. checkName is real; the map read
// and founding/placement/invite endpoints are declared stubs. Name-availability
// and the founding 409 gate are pure functions so they are testable.
package atlas

import (
	"context"

	"fs-pro-server/internal/db"
)

// NameCheck is the checkName payload.
type NameCheck struct {
	OK      bool    `json:"ok"`
	Problem *string `json:"problem"`
}

// NameAvailability returns the check result for a set of conflicting names.
// An empty conflict set is available.
func NameAvailability(conflicts []string) NameCheck {
	if len(conflicts) == 0 {
		return NameCheck{OK: true}
	}
	problem := "That name or code is taken"
	return NameCheck{OK: false, Problem: &problem}
}

// ValidKind reports whether kind is one of the contract's checkName kinds.
func ValidKind(kind string) bool {
	switch kind {
	case "country", "region", "town", "club":
		return true
	default:
		return false
	}
}

// FoundingRefusal mirrors club-founding's "new places need names" 409: it
// returns the message to refuse with when a required name was not supplied.
func FoundingRefusal(needsTown, needsRegion, needsCountry bool, hasTown, hasRegion, hasCountry bool) (string, bool) {
	switch {
	case needsTown && !hasTown:
		return "Name your new town before founding the club", true
	case needsRegion && !hasRegion:
		return "Name your new region before founding the club", true
	case needsCountry && !hasCountry:
		return "Name your new country before founding the club", true
	}
	return "", false
}

// Repository reads places/clubs for name checks.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// PlaceConflicts returns existing place names/codes matching value.
func (r *Repository) PlaceConflicts(ctx context.Context, kind, name, code string) ([]string, error) {
	rows, err := r.q.Query(ctx, `SELECT "Name" FROM "Places" WHERE ("Name" = $1 OR ("Code" <> '' AND "Code" = $2)) AND "Type" = $3 LIMIT 1`, name, code, kind)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, m := range list {
		out = append(out, db.StringField(m, "Name"))
	}
	return out, nil
}

// ClubConflicts returns existing club names/codes matching value.
func (r *Repository) ClubConflicts(ctx context.Context, name, code string) ([]string, error) {
	rows, err := r.q.Query(ctx, `SELECT "Name" FROM "Clubs" WHERE "Name" = $1 OR "ClubCode" = $2 LIMIT 1`, name, code)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, m := range list {
		out = append(out, db.StringField(m, "Name"))
	}
	return out, nil
}
