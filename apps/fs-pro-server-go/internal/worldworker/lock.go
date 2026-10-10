// Package worldworker is the game's background daemon core (docs/coc-mapping/05
// §4): a ticker registry with per-job advisory locks so any number of worker
// instances can run safely, plus the first ticker (the builder sweep). cmd/
// world-worker is the thin binary around it.
package worldworker

import (
	"context"
	"fmt"

	"fs-pro-server/internal/db"
)

// Advisory lock keys. A distinct key per ticker so two instances cannot run the
// same job at once (mirrors atlas.placementLockID).
const (
	// LockBuilders guards the ClubAssets completion sweep.
	LockBuilders int64 = 0x46535742 // "FSWB"
	// LockDefenses guards the async defense-resolution sweep (05 §4).
	LockDefenses int64 = 0x46535744 // "FSWD"
	// LockShields guards the Rest Window / Warm-up Guard sweep (05 §4).
	LockShields int64 = 0x46535753 // "FSWS"
	// LockLeague guards the weekly ladder rollover (05 §4, 04 §4.3).
	LockLeague int64 = 0x4653574C // "FSWL"
	// LockAssociation guards the Derby lifecycle transitions (05 §4, 02 §G).
	LockAssociation int64 = 0x46535741 // "FSWA"
)

// TryAdvisoryLock takes a session-level pg_try_advisory_lock and reports whether
// it was acquired (mirrors the PLACEMENT_LOCK pattern in
// internal/atlas/founding.go). A session lock is held by the connection, so the
// caller must release it with AdvisoryUnlock on the SAME connection; for pooled
// work prefer TryAdvisoryXactLock, which the registry uses.
func TryAdvisoryLock(ctx context.Context, q db.Querier, key int64) (bool, error) {
	var ok bool
	if err := q.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, key).Scan(&ok); err != nil {
		return false, fmt.Errorf("worldworker: acquire advisory lock %d: %w", key, err)
	}
	return ok, nil
}

// AdvisoryUnlock releases a session-level advisory lock, reporting whether it
// was held (it returns false when the lock belongs to another connection).
func AdvisoryUnlock(ctx context.Context, q db.Querier, key int64) (bool, error) {
	var ok bool
	if err := q.QueryRow(ctx, `SELECT pg_advisory_unlock($1)`, key).Scan(&ok); err != nil {
		return false, fmt.Errorf("worldworker: release advisory lock %d: %w", key, err)
	}
	return ok, nil
}

// TryAdvisoryXactLock takes a transaction-scoped advisory lock: it is held until
// the surrounding transaction ends and is released automatically, so it is the
// correct mutex for a pooled worker. It returns false when another instance
// holds the lock.
func TryAdvisoryXactLock(ctx context.Context, q db.Querier, key int64) (bool, error) {
	var ok bool
	if err := q.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock($1)`, key).Scan(&ok); err != nil {
		return false, fmt.Errorf("worldworker: acquire xact advisory lock %d: %w", key, err)
	}
	return ok, nil
}
