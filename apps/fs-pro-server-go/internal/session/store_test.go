package session

import (
	"context"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
)

func TestPgStoreCRUDSkipsWithoutDatabaseURL(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 5*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()

	store := NewPgStore(pool)
	ctx := context.Background()
	sid := "go-test-session-" + time.Now().Format("20060102150405")
	t.Cleanup(func() { _ = store.Destroy(ctx, sid) })

	data := map[string]any{"userID": "u1", "cookie": map[string]any{"maxAge": float64(60000)}}
	if err := store.Set(ctx, sid, data); err != nil {
		t.Fatalf("Set: %v", err)
	}
	got, err := store.Get(ctx, sid)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got == nil || got["userID"] != "u1" {
		t.Fatalf("Get = %v", got)
	}
	if err := store.Touch(ctx, sid, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("Touch: %v", err)
	}
	if err := store.Destroy(ctx, sid); err != nil {
		t.Fatalf("Destroy: %v", err)
	}
	if after, _ := store.Get(ctx, sid); after != nil {
		t.Fatalf("session should be gone, got %v", after)
	}
}

func TestMaxAgeFromCookie(t *testing.T) {
	if got := maxAge(map[string]any{"cookie": map[string]any{"maxAge": float64(120000)}}); got != 2*time.Minute {
		t.Fatalf("maxAge = %s", got)
	}
	if got := maxAge(nil); got != defaultMaxAge {
		t.Fatalf("default maxAge = %s", got)
	}
}
