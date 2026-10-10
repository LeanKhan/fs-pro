package play

import (
	"log/slog"
	"testing"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/realtime"
)

// TestRealtimeNotifierDurablePathRolledBack proves the wired notifier still
// writes the durable inbox row, and that an unconfigured or unreachable
// gateway never fails or blocks the write. Uses the scratch DB in a rolled-back
// transaction (nothing is left behind).
func TestRealtimeNotifierDurablePathRolledBack(t *testing.T) {
	_, ctx, inRollback := raidPool(t)

	inRollback(func(tx db.Querier) error {
		defender, err := raidClub(ctx, tx, "Hit Hard FC")
		if err != nil {
			return err
		}
		notice := DefenseNotice{
			RaidID: "raid-x", DefenderID: defender, AttackerID: "att-x",
			AttackerName: "Raider FC", AttackerGoals: 2, DefenderGoals: 1,
		}

		// Unconfigured: durable-only, no publisher.
		unconfigured := NewRealtimeNotifier(realtime.New("", "", slog.Default()))
		if err := unconfigured.RaidResolved(ctx, tx, notice); err != nil {
			return err
		}
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "ClubMessages" WHERE "ClubId"=$1`, defender); n != 1 {
			t.Fatalf("unconfigured: ClubMessages = %d, want 1", n)
		}

		// Configured but the gateway is down: the durable write must still
		// succeed and the notifier must return nil (a realtime hiccup is logged,
		// not returned). Port 1 is closed.
		down := NewRealtimeNotifier(realtime.New("http://127.0.0.1:1", "secret", slog.Default()))
		if err := down.RaidResolved(ctx, tx, notice); err != nil {
			t.Fatalf("a down gateway must not fail the write: %v", err)
		}
		if n := countRows(t, ctx, tx, `SELECT count(*)::int AS n FROM "ClubMessages" WHERE "ClubId"=$1`, defender); n != 2 {
			t.Fatalf("down gateway: ClubMessages = %d, want 2", n)
		}
		return nil
	})
}
