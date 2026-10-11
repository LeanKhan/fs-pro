package award

import (
	"context"
	"testing"
)

func TestAttachResolvesDistinctIDs(t *testing.T) {
	rows := []map[string]any{
		{"_id": "a1", "RecipientId": "p1"},
		{"_id": "a2", "RecipientId": "p2"},
		{"_id": "a3", "RecipientId": nil},
	}
	calls := 0
	lookup := func(_ context.Context, id string) (map[string]any, bool, error) {
		calls++
		if id == "p1" {
			return map[string]any{"_id": "p1", "FirstName": "Ada"}, true, nil
		}
		return nil, false, nil
	}
	if err := attach(context.Background(), rows, "RecipientId", "Recipient", lookup); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 lookups, got %d", calls)
	}
	if rows[0]["Recipient"] == nil {
		t.Fatal("p1 should resolve")
	}
	if _, ok := rows[1]["Recipient"]; ok {
		t.Fatal("p2 does not resolve and must be omitted")
	}
	if _, ok := rows[2]["Recipient"]; ok {
		t.Fatal("nil id must be omitted")
	}
}
