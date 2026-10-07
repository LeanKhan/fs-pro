package pyramid

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"fs-pro-world-service/internal/db"
)

// Regression test for the B2-2C finding: POST /pyramid/draw returned
// 500 {"error":"pyramid draw failed"} with "context canceled" because
// db.Pool.Query/QueryRow cancelled their per-call context before the returned
// pgx rows/row were consumed. This exercises the real Draw path (QueryRow for
// the competition, then Query + iteration over the country's clubs) against a
// scratch DB.
//
//	WORLD_TEST_DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_b2c \
//	WORLD_TEST_COMPETITION_ID=<uuid> \
//	  go test ./internal/pyramid -run TestDrawIntegration -v
func TestDrawIntegration(t *testing.T) {
	url := os.Getenv("WORLD_TEST_DATABASE_URL")
	competitionID := os.Getenv("WORLD_TEST_COMPETITION_ID")
	if url == "" || competitionID == "" {
		t.Skip("set WORLD_TEST_DATABASE_URL and WORLD_TEST_COMPETITION_ID to run this integration test")
	}

	pool, err := db.New(context.Background(), url, 10*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()

	assignment, err := New(pool).Draw(context.Background(), competitionID)
	if err != nil {
		if errors.Is(err, ErrNoEdition) {
			t.Skip("competition has no drawable edition")
		}
		t.Fatalf("Draw: %v", err)
	}
	if len(assignment.Pools) == 0 {
		t.Fatal("Draw returned no pools")
	}
}
