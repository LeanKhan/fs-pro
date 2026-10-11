package play

import (
	"reflect"
	"strings"
	"testing"
)

// TestBatchClubIDs pins the deterministic (id-ascending, de-duplicated) order
// that ResolvePendingRaids uses to pre-lock every club a batch touches. That
// order is what keeps two concurrent batches from deadlocking on shared club
// rows: every batch acquires the same rows in the same sequence, so a shared
// club serialises the batches instead of forming a lock cycle. The contention
// case itself is exercised end-to-end by cmd/loadtest with fewer clubs than
// raids.
func TestBatchClubIDs(t *testing.T) {
	raids := []map[string]any{
		{"AttackerClubId": "c", "DefenderClubId": "a"},
		{"AttackerClubId": "b", "DefenderClubId": "a"},
		{"AttackerClubId": "b", "DefenderClubId": "d"},
		{"AttackerClubId": "", "DefenderClubId": "c"},
		{"AttackerClubId": "a", "DefenderClubId": ""},
	}
	got := batchClubIDs(raids)
	want := []string{"a", "b", "c", "d"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("batchClubIDs = %v, want %v", got, want)
	}

	if empty := batchClubIDs(nil); len(empty) != 0 {
		t.Fatalf("batchClubIDs(nil) = %v, want empty", empty)
	}

	// The claim query must project the club ids, otherwise the pre-lock sees
	// none and the deadlock regression returns.
	if !strings.Contains(claimPendingRaidsSQL, "AttackerClubId") || !strings.Contains(claimPendingRaidsSQL, "DefenderClubId") {
		t.Fatal("ResolvePendingRaids claim query must project AttackerClubId/DefenderClubId")
	}
}
