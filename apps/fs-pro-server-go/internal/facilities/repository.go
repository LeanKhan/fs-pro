package facilities

import (
	"context"
	"fmt"
	"time"

	"fs-pro-server/internal/db"
)

// Repository is the pgx-backed facilities store.
type Repository struct {
	q db.Querier
}

// NewRepository wraps a Querier.
func NewRepository(q db.Querier) *Repository { return &Repository{q: q} }

// Q exposes the querier for access checks.
func (r *Repository) Q() db.Querier { return r.q }

// Club reads the fields campus needs.
func (r *Repository) Club(ctx context.Context, clubID string) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, `SELECT "_id", "Name", "ClubCode", "Budget", "CampusPlacement" FROM "Clubs" WHERE "_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// CompleteDueUpgrades finishes every upgrade whose CompleteAt has passed.
func (r *Repository) CompleteDueUpgrades(ctx context.Context, now time.Time) error {
	_, err := r.q.Exec(ctx, `UPDATE "ClubAssets"
		SET "Level" = "UpgradingTo", "UpgradingTo" = NULL, "StartAt" = NULL, "CompleteAt" = NULL, "updatedAt" = now()
		WHERE "UpgradingTo" IS NOT NULL AND "CompleteAt" <= $1`, now)
	return err
}

// AssetRows returns the club's ClubAssets rows keyed by AssetType.
func (r *Repository) AssetRows(ctx context.Context, clubID string) (map[AssetType]map[string]any, error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "ClubAssets" WHERE "ClubId" = $1`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make(map[AssetType]map[string]any, len(list))
	for _, row := range list {
		out[AssetType(db.StringField(row, "AssetType"))] = row
	}
	return out, nil
}

// SetPlacement stores the whole campus layout.
func (r *Repository) SetPlacement(ctx context.Context, clubID string, placement map[string]any) (bool, error) {
	rows, err := r.q.Query(ctx, `UPDATE "Clubs" SET "CampusPlacement" = $2, "updatedAt" = now() WHERE "_id" = $1 RETURNING "_id"`, clubID, placement)
	if err != nil {
		return false, err
	}
	_, ok, err := db.ScanOne(rows)
	return ok, err
}

// StartUpgrade pays for and starts the next level of an asset. The budget debit
// is a guarded UPDATE (Budget >= cost) so racing requests cannot overspend.
func (r *Repository) StartUpgrade(ctx context.Context, clubID string, assetType AssetType) error {
	def := AssetConfig[assetType]
	if err := r.CompleteDueUpgrades(ctx, time.Now()); err != nil {
		return err
	}
	rows, err := r.AssetRows(ctx, clubID)
	if err != nil {
		return err
	}
	existing := rows[assetType]
	level := levelOf(rows, assetType)
	target := level + 1

	if existing != nil && existing["UpgradingTo"] != nil {
		return fmt.Errorf("%s is already being upgraded", def.Name)
	}
	if level >= MaxAssetLevel {
		return fmt.Errorf("%s is already at max level", def.Name)
	}
	active := 0
	for _, row := range rows {
		if row["UpgradingTo"] != nil {
			active++
		}
	}
	if active >= MaxConcurrentUpgrades {
		return fmt.Errorf("all builders are busy - wait for the current upgrade to finish")
	}
	for _, req := range def.Requires {
		needed := target - req.LevelOffset
		if levelOf(rows, req.Type) < needed {
			return fmt.Errorf("%s level %d requires %s level %d", def.Name, target, AssetConfig[req.Type].Name, needed)
		}
	}

	cost := UpgradeCost(assetType, target)
	debited, err := r.q.Exec(ctx, `UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) - $2, "updatedAt" = now()
		WHERE "_id" = $1 AND coalesce("Budget",0) >= $2`, clubID, cost)
	if err != nil {
		return err
	}
	if debited.RowsAffected() == 0 {
		return fmt.Errorf("insufficient budget")
	}

	start := time.Now()
	completeAt := upgradeCompleteAt(assetType, target, start)
	if _, err := r.q.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId","AssetType","Level","UpgradingTo","StartAt","CompleteAt","updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,now())
		ON CONFLICT ("ClubId","AssetType") DO UPDATE SET "UpgradingTo"=EXCLUDED."UpgradingTo", "StartAt"=EXCLUDED."StartAt", "CompleteAt"=EXCLUDED."CompleteAt", "updatedAt"=now()`,
		clubID, string(assetType), level, target, start, completeAt); err != nil {
		return err
	}
	if _, err := r.q.Exec(ctx, `INSERT INTO "TransferLedger" ("Type","BuyerClubId","Amount","Note","updatedAt") VALUES ('facility',$1,$2,$3,now())`,
		clubID, cost, fmt.Sprintf("%s -> level %d", def.Name, target)); err != nil {
		return err
	}
	return nil
}

func levelOf(rows map[AssetType]map[string]any, t AssetType) int {
	if row := rows[t]; row != nil {
		return intOf(row["Level"])
	}
	return 0
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}

func floatOf(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}
