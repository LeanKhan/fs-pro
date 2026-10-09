package player

import (
	"context"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func numOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case int32:
		return float64(n)
	default:
		return 0
	}
}

func intOf(v any) int { return int(numOf(v)) }

func oneRow(ctx context.Context, q db.Querier, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// TestGeneratePlayersRolledBack exercises the real local generator and the
// insert path inside a transaction that is always rolled back.
func TestGeneratePlayersRolledBack(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	t.Setenv("ENABLE_PLAYER_GENERATION", "true")
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		h := New(NewRepository(tx), nil)
		req := httptest.NewRequest("GET", "/api/players/generate-players?number=3&culture=bellean&position=MID", nil)
		resp := h.generatePlayers(nil, nil, req)
		if resp.Status != 200 {
			t.Fatalf("generatePlayers status %d: %v", resp.Status, resp.Body["payload"])
		}
		list, _ := resp.Body["payload"].([]any)
		if len(list) != 3 {
			t.Fatalf("generated %d, want 3", len(list))
		}
		for _, item := range list {
			p, _ := item.(map[string]any)
			if p == nil {
				t.Fatal("nil player")
			}
			if db.StringField(p, "Position") != "MID" {
				t.Errorf("position = %v", p["Position"])
			}
			rating := numOf(p["Rating"])
			value := numOf(p["Value"])
			age := intOf(p["Age"])
			if rating < 0 || rating > 99 {
				t.Errorf("rating out of range: %v", rating)
			}
			if value <= 0 {
				t.Errorf("value not set: %v", value)
			}
			if age < 18 || age > 30 {
				t.Errorf("age out of range: %v", age)
			}
			if p["Attributes"] == nil || db.StringField(p, "Role") == "" {
				t.Errorf("attributes/role missing: %v", p)
			}
		}
		// The row is persisted (in the tx).
		n, _, err := oneRow(ctx, tx, `SELECT count(*)::int AS n FROM "Players" WHERE "Position" = 'MID'`)
		if err != nil {
			return err
		}
		if n == nil || intOf(n["n"]) < 3 {
			t.Errorf("players not persisted: %v", n)
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back generatePlayers: %v", err)
	}
}
