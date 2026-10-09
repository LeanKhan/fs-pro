package world

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/session"
)

// TestWorldAdminHandlersDenyNonAdmin is the S1 regression + companion to the
// policy D1 test: every world.* handler-rule route that is admin-only in Node
// must return 401 anonymous / 403 "You do not manage this club" for a signed-in
// non-admin, and 200 for an admin.
func TestWorldAdminHandlersDenyNonAdmin(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := db.New(context.Background(), url, 15*time.Second, nil)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer pool.Close()
	ctx := context.Background()

	run := func(tx db.Querier) error {
		h := New(NewRepository(tx))
		anon := &httpapi.Context{Session: &session.State{Data: map[string]any{}}}
		nonAdmin := &httpapi.Context{Session: &session.State{Data: map[string]any{"userID": "11111111-1111-1111-1111-111111111111"}}}
		req := httptest.NewRequest(http.MethodPost, "/api/world/end-year", nil)

		handlers := map[string]func(*httpapi.Context, http.ResponseWriter, *http.Request) httpapi.Response{
			"world.updateSettings": h.updateSettings,
			"world.endYear":        h.endYear,
			"world.advanceDay":     h.advanceDay,
		}
		for name, fn := range handlers {
			if resp := fn(anon, nil, req); resp.Status != 401 || resp.Body["message"] != "Not logged in" {
				t.Errorf("%s anonymous = %d %v, want 401 Not logged in", name, resp.Status, resp.Body["message"])
			}
			if resp := fn(nonAdmin, nil, req); resp.Status != 403 || resp.Body["message"] != "You do not manage this club" {
				t.Errorf("%s non-admin = %d %v, want 403 You do not manage this club", name, resp.Status, resp.Body["message"])
			}
		}

		// An admin succeeds (the write rolls back with the tx).
		admin, ok, err := scanOne(ctx, tx, `SELECT "_id" FROM "Users" WHERE "isAdmin" = true LIMIT 1`)
		if err != nil {
			return err
		}
		if !ok {
			t.Skip("no admin user")
		}
		adminCx := &httpapi.Context{Session: &session.State{Data: map[string]any{"userID": db.StringField(admin, "_id")}}}
		if _, err := tx.Exec(ctx, `UPDATE "Calendars" SET "CurrentYear" = 1, "YearStartDay" = 0, "CurrentDay" = 10, "updatedAt" = now()`); err != nil {
			return err
		}
		resp := h.endYear(adminCx, nil, req)
		if resp.Status != 200 {
			t.Errorf("admin endYear = %d %v, want 200", resp.Status, resp.Body["message"])
		}
		return nil
	}
	if err := db.InRollback(ctx, pool, run); err != nil {
		t.Fatalf("rolled-back admin check: %v", err)
	}
}
