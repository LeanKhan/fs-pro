package association

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Association Grounds + Festival Weekend (02 §G): a shared co-op build funded
// with Capital Gold, and the weekly Fri 07:00 -> Mon 07:00 UTC raid event. The
// Festival window itself is computed on read (FestivalActive / FestivalWindow),
// so no timer writes rows; the Grounds level and Capital Gold are the durable
// co-op state.

// GetGrounds returns the Grounds read model (with the Festival window).
func (r *Repository) GetGrounds(ctx context.Context, assocID string, now time.Time) (map[string]any, error) {
	row, ok, err := scanOne(ctx, r.q, `SELECT "AssociationId", "Level", "CapitalGold", "Layout" FROM "AssociationGrounds" WHERE "AssociationId" = $1`, assocID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return groundsPayload(assocID, 1, 0, now), nil
	}
	return groundsPayload(assocID, intOf(row["Level"]), floatOf(row["CapitalGold"]), now), nil
}

// ContributeGrounds funds a co-op build step: the club pays Cash, the Capital
// Gold is banked, and any completed level (or levels) are applied atomically.
func (r *Repository) ContributeGrounds(ctx context.Context, assocID, clubID string, gold int, now time.Time) (map[string]any, error) {
	if gold <= 0 {
		return nil, ErrInvalidInput
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, ok, err := assocRow(ctx, tx, assocID, false); err != nil {
			return err
		} else if !ok {
			return ErrAssociationNotFound
		}
		if _, ok, err := memberRole(ctx, tx, assocID, clubID); err != nil {
			return err
		} else if !ok {
			return ErrNotAMember
		}
		row, ok, err := scanOne(ctx, tx, `SELECT "Level", "CapitalGold" FROM "AssociationGrounds" WHERE "AssociationId" = $1 FOR UPDATE`, assocID)
		if err != nil {
			return err
		}
		level, capital := 1, 0.0
		if ok {
			level = intOf(row["Level"])
			capital = floatOf(row["CapitalGold"])
		}
		if level < 1 {
			level = 1
		}
		if level >= GroundsMaxLevel {
			return ErrGroundsMaxed
		}
		if err := debitCash(ctx, tx, clubID, float64(gold)); err != nil {
			return err
		}
		capital += float64(gold)
		for level < GroundsMaxLevel {
			cost := GroundsUpgradeCost(level)
			if cost <= 0 || capital < float64(cost) {
				break
			}
			capital -= float64(cost)
			level++
		}
		if _, err := tx.Exec(ctx, `INSERT INTO "AssociationGrounds" ("AssociationId", "Level", "CapitalGold", "updatedAt")
			VALUES ($1, $2, $3, $4)
			ON CONFLICT ("AssociationId") DO UPDATE SET "Level" = EXCLUDED."Level", "CapitalGold" = EXCLUDED."CapitalGold", "updatedAt" = EXCLUDED."updatedAt"`,
			assocID, level, capital, now); err != nil {
			return err
		}
		if err := writeLedger(ctx, tx, "grounds", clubID, "", "", float64(gold), "Association Grounds contribution"); err != nil {
			return err
		}
		out = groundsPayload(assocID, level, capital, now)
		return nil
	})
	return out, err
}

func groundsPayload(assocID string, level int, capital float64, now time.Time) map[string]any {
	if level < 1 {
		level = 1
	}
	_, close := FestivalWindow(now)
	return map[string]any{
		"associationId":    assocID,
		"level":            level,
		"maxLevel":         GroundsMaxLevel,
		"capitalGold":      round(capital),
		"nextCost":         GroundsUpgradeCost(level),
		"festivalActive":   FestivalActive(now),
		"festivalClosesAt": db.ISO8601msUTC(close),
	}
}
