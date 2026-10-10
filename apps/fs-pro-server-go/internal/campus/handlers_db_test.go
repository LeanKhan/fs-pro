package campus

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/httpapi"
)

// TestUsePerkHandlerRolledBack proves the route validation and status mapping:
// a missing perk is a 400, an unknown perk is a 400, an empty inventory is a
// 409, and a successful redemption returns the refreshed campus.
func TestUsePerkHandlerRolledBack(t *testing.T) {
	_, ctx, inRollback := campusPool(t)
	inRollback(func(tx db.Querier) error {
		club := newTestClub(t, ctx, tx, map[string]any{"Budget": 0.0})
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "Perks" = '{"cash_cache":1}'::jsonb WHERE "_id"=$1`, club); err != nil {
			return err
		}
		h := New(NewRepository(tx))
		call := func(body map[string]any) httpapi.Response {
			cx := httpapi.NewContext(nil)
			cx.SetBodyMap(body)
			r := httptest.NewRequest(http.MethodPost, "/api/campus/"+club+"/perk/use", nil)
			r.SetPathValue("clubId", club)
			return h.usePerk(cx, nil, r)
		}

		if got := call(map[string]any{}); got.Status != 400 {
			t.Errorf("missing perk = %d, want 400", got.Status)
		}
		if got := call(map[string]any{"perk": "cash_cache", "instanceId": 7}); got.Status != 400 {
			t.Errorf("non-string instanceId = %d, want 400", got.Status)
		}
		if got := call(map[string]any{"perk": "not_a_perk"}); got.Status != 400 {
			t.Errorf("unknown perk = %d, want 400", got.Status)
		}
		if got := call(map[string]any{"perk": "fan_cache"}); got.Status != 409 {
			t.Errorf("empty fan_cache = %d, want 409", got.Status)
		}
		got := call(map[string]any{"perk": "cash_cache", "instanceId": "handler-1"})
		if got.Status != 200 {
			t.Fatalf("redeem = %d (%v), want 200", got.Status, got.Body)
		}
		data, _ := got.Body["payload"].(map[string]any)
		perks, _ := data["perks"].([]any)
		if len(perks) == 0 {
			t.Fatalf("campus payload has no perks: %v", data)
		}
		if floatOf(mustClubRow(t, ctx, tx, club)["Budget"]) != 250000 {
			t.Error("the perk's currency was not credited")
		}
		return nil
	})
}
