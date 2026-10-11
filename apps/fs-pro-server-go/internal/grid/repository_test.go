package grid

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// emptyRows is a pgx.Rows that yields no rows, so the missing-club branch of
// PgRepository.GetLayouts can be exercised without a database.
type emptyRows struct{}

func (emptyRows) Close()                                       {}
func (emptyRows) Err() error                                   { return nil }
func (emptyRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (emptyRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (emptyRows) Next() bool                                   { return false }
func (emptyRows) Scan(...any) error                            { return nil }
func (emptyRows) Values() ([]any, error)                       { return nil, nil }
func (emptyRows) RawValues() [][]byte                          { return nil }
func (emptyRows) Conn() *pgx.Conn                              { return nil }

// emptyQuerier returns an empty result set for every query, standing in for a
// club row that does not exist.
type emptyQuerier struct{}

func (emptyQuerier) Query(context.Context, string, ...any) (pgx.Rows, error) { return emptyRows{}, nil }
func (emptyQuerier) QueryRow(context.Context, string, ...any) pgx.Row        { return nil }
func (emptyQuerier) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

// TestRepositoryMissingClubIsEmptyNonNil pins the Repository contract: a club
// that has never saved a layout reads back as an empty *non-nil* Layouts, never
// a nil one, on both implementations.
func TestRepositoryMissingClubIsEmptyNonNil(t *testing.T) {
	ctx := context.Background()
	repos := map[string]Repository{
		"memory": NewMemoryRepository(),
		"pg":     NewPgRepository(emptyQuerier{}),
	}
	for name, repo := range repos {
		got, err := repo.GetLayouts(ctx, "never-saved")
		if err != nil {
			t.Fatalf("%s: GetLayouts: %v", name, err)
		}
		if got == nil {
			t.Errorf("%s: GetLayouts returned a nil Layouts; the contract promises empty non-nil", name)
		}
		if len(got) != 0 {
			t.Errorf("%s: GetLayouts = %v, want empty", name, got)
		}
		// It must serialise as {} (an object), never null.
		if b, err := got.MarshalJSON(); err != nil || string(b) != "{}" {
			t.Errorf("%s: empty Layouts JSON = %s (err %v), want {}", name, b, err)
		}
	}
}
