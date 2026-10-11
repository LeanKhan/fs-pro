package play

import (
	"context"
	"fmt"
	"math"
	"os"
	"strconv"
	"time"

	"fs-pro-server/internal/db"
	"fs-pro-server/internal/facilities"
)

// Club shop, ported from services/play/shop.ts: takings accrue from fans and
// seats, capped, and the owner banks them (a guarded, once-only collect).

const (
	shopBasePerHour      = 1500.0
	shopPerFan           = 6.0
	shopPerSeat          = 1.0
	shopBaseStorageHours = 6.0
	shopStoragePerTier   = 2.0
)

func (r *Repository) one(ctx context.Context, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

func gameTimeScale() float64 {
	if v := os.Getenv("GAME_TIME_SCALE"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0.01 {
			return f
		}
	}
	return 1
}

func scaled(amount float64) float64 { return amount / gameTimeScale() }

func (r *Repository) shopRates(ctx context.Context, clubID string) (float64, float64, error) {
	level := 0
	if row, _, err := r.one(ctx, `SELECT "Level" AS n FROM "ClubAssets" WHERE "ClubId" = $1 AND "AssetType" = 'stands' LIMIT 1`, clubID); err != nil {
		return 0, 0, err
	} else if row != nil {
		level = intOf(row["n"])
	}
	capacity := facilities.Effects(facilities.Stands, level)["capacity"]
	tiers := []float64{1000, 3000, 8000, 18000, 32000, 55000}
	standsTier := 0
	for i, t := range tiers {
		if t == capacity {
			standsTier = i
			break
		}
	}
	club, _, err := r.one(ctx, `SELECT "Fans" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return 0, 0, err
	}
	fans := 0.0
	if club != nil {
		fans = floatOf(club["Fans"])
	}
	designPerHour := shopBasePerHour + shopPerFan*fans + shopPerSeat*capacity
	storageHours := shopBaseStorageHours + shopStoragePerTier*float64(standsTier)
	perHour := designPerHour / scaled(1)
	cap := math.Round(designPerHour * storageHours)
	return perHour, cap, nil
}

func shopCollectedAt(club map[string]any) (int64, bool) {
	fin, _ := club["Finances"].(map[string]any)
	if fin == nil {
		return 0, false
	}
	s, _ := fin["shopCollectedAt"].(string)
	if s == "" {
		return 0, false
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.000Z", s)
	}
	if err != nil {
		return 0, false
	}
	return t.UnixMilli(), true
}

func shopState(perHour, cap float64, lastMs int64, hasLast bool, now int64) map[string]any {
	earned := cap
	if hasLast {
		earned = perHour * math.Max(0, float64(now-lastMs)) / 3600000
	}
	pending := math.Min(cap, math.Floor(earned))
	secondsToFull := 0.0
	if perHour > 0 {
		secondsToFull = math.Ceil((cap - pending) / perHour * 3600)
	}
	return map[string]any{
		"pending": int(pending), "cap": int(cap),
		"perHour": int(math.Round(perHour)), "secondsToFull": int(secondsToFull),
	}
}

// CollectShop is POST /api/play/{clubId}/shop/collect.
func (r *Repository) CollectShop(ctx context.Context, clubID string) (map[string]any, error) {
	club, ok, err := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Club not found")
	}
	perHour, cap, err := r.shopRates(ctx, clubID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	lastMs, hasLast := shopCollectedAt(club)
	pending := 0
	if s := shopState(perHour, cap, lastMs, hasLast, now); s != nil {
		pending = s["pending"].(int)
	}
	budget := floatOf(club["Budget"])
	if pending < 1 {
		return map[string]any{"collected": 0, "shop": shopState(perHour, cap, now, true, now), "budget": budget}, nil
	}

	stamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	var newBudget float64
	updated := false
	err = db.WithTx(ctx, r.q, func(tx db.Querier) error {
		where := `"_id" = $1 AND ("Finances" IS NULL OR "Finances"->>'shopCollectedAt' IS NULL)`
		args := []any{clubID, pending, stamp}
		if hasLast {
			where = `"_id" = $1 AND "Finances"->>'shopCollectedAt' = $4`
			prev, _ := (func() (string, bool) {
				fin, _ := club["Finances"].(map[string]any)
				if fin == nil {
					return "", false
				}
				s, _ := fin["shopCollectedAt"].(string)
				return s, true
			})()
			args = append(args, prev)
		}
		rows, err := tx.Query(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) + $2,
			"Finances" = jsonb_set(coalesce("Finances", '{}'::jsonb), '{shopCollectedAt}', to_jsonb($3::text)),
			"updatedAt" = now() WHERE `+where+` RETURNING "Budget"`, args...)
		if err != nil {
			return err
		}
		row, ok, err := db.ScanOne(rows)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		updated = true
		newBudget = floatOf(row["Budget"])
		_, err = db.InsertRow(ctx, tx, "TransferLedger", map[string]any{
			"Type": "shop_income", "BuyerClubId": clubID, "Amount": pending,
			"Note": "Club shop takings", "updatedAt": time.Now(),
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	if !updated {
		fresh, _, _ := r.one(ctx, `SELECT * FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
		lastMs, hasLast = shopCollectedAt(fresh)
		b := 0.0
		if fresh != nil {
			b = floatOf(fresh["Budget"])
		}
		return map[string]any{"collected": 0, "shop": shopState(perHour, cap, lastMs, hasLast, now), "budget": b}, nil
	}
	return map[string]any{"collected": pending, "shop": shopState(perHour, cap, now, true, now), "budget": newBudget}, nil
}
