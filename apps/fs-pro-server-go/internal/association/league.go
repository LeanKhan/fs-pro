package association

import (
	"context"
	"time"

	"fs-pro-server/internal/db"
)

// Association League (02 §G): a season-long bracket of eight associations with
// promotion and relegation, stored in AssociationLeagueSeasons / Standings.

// CreateLeagueSeason seeds a season and assigns each association to a bracket
// of LeagueGroupSize (the association order defines the brackets).
func (r *Repository) CreateLeagueSeason(ctx context.Context, seasonKey string, startsAt, endsAt time.Time, assocIDs []string, now time.Time) (map[string]any, error) {
	if seasonKey == "" || !startsAt.Before(endsAt) || len(assocIDs) == 0 {
		return nil, ErrInvalidInput
	}
	var out map[string]any
	err := db.WithTx(ctx, r.q, func(tx db.Querier) error {
		for _, id := range assocIDs {
			if _, ok, err := assocRow(ctx, tx, id, false); err != nil {
				return err
			} else if !ok {
				return ErrAssociationNotFound
			}
		}
		_, err := tx.Exec(ctx, `INSERT INTO "AssociationLeagueSeasons" ("SeasonKey", "StartsAt", "EndsAt", "updatedAt")
			VALUES ($1, $2, $3, $4) ON CONFLICT ("SeasonKey") DO NOTHING`, seasonKey, startsAt, endsAt, now)
		if err != nil {
			return err
		}
		for i, id := range assocIDs {
			group := GroupIndexFor(i)
			if _, err := tx.Exec(ctx, `INSERT INTO "AssociationLeagueStandings" ("SeasonKey", "AssociationId", "GroupIndex", "Stars", "updatedAt")
				VALUES ($1, $2, $3, 0, $4) ON CONFLICT ("SeasonKey", "AssociationId") DO UPDATE SET "GroupIndex" = EXCLUDED."GroupIndex", "updatedAt" = now()`,
				seasonKey, id, group, now); err != nil {
				return err
			}
		}
		season, _, err := scanOne(ctx, tx, leagueSeasonColumns+` WHERE "SeasonKey" = $1`, seasonKey)
		if err != nil {
			return err
		}
		out = map[string]any{
			"seasonKey": seasonKey,
			"startsAt":  nullableString(season["StartsAt"]),
			"endsAt":    nullableString(season["EndsAt"]),
			"groups":    (len(assocIDs) + LeagueGroupSize - 1) / LeagueGroupSize,
		}
		return nil
	})
	return out, err
}

// RecordLeagueStars adds a season's earned stars for an association.
func (r *Repository) RecordLeagueStars(ctx context.Context, seasonKey, assocID string, stars int, now time.Time) error {
	if stars <= 0 {
		return nil
	}
	tag, err := r.q.Exec(ctx, `UPDATE "AssociationLeagueStandings" SET "Stars" = "Stars" + $3, "updatedAt" = $4
		WHERE "SeasonKey" = $1 AND "AssociationId" = $2`, seasonKey, assocID, stars, now)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAssociationNotFound
	}
	return nil
}

// FinalizeLeagueSeason computes every bracket's placement and reports the
// promoted and relegated associations. Idempotent: recomputing placements from
// stars yields the same table.
func (r *Repository) FinalizeLeagueSeason(ctx context.Context, seasonKey string, now time.Time) (map[string]any, error) {
	rows, err := scanAll(ctx, r.q, `SELECT "AssociationId", "GroupIndex", "Stars" FROM "AssociationLeagueStandings" WHERE "SeasonKey" = $1`, seasonKey)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrAssociationNotFound
	}
	groups := map[int][]LeagueStanding{}
	for _, row := range rows {
		standing := LeagueStanding{
			AssociationID: db.StringField(row, "AssociationId"),
			Stars:         intOf(row["Stars"]),
			GroupIndex:    intOf(row["GroupIndex"]),
		}
		groups[standing.GroupIndex] = append(groups[standing.GroupIndex], standing)
	}
	promoted := []any{}
	relegated := []any{}
	table := []any{}
	for groupIndex, members := range groups {
		ranked := RankGroup(members)
		for i, standing := range ranked {
			placement := i + 1
			if _, err := r.q.Exec(ctx, `UPDATE "AssociationLeagueStandings" SET "Placement" = $3, "updatedAt" = $4
				WHERE "SeasonKey" = $1 AND "AssociationId" = $2`, seasonKey, standing.AssociationID, placement, now); err != nil {
				return nil, err
			}
			entry := map[string]any{
				"associationId": standing.AssociationID,
				"groupIndex":    groupIndex,
				"stars":         standing.Stars,
				"placement":     placement,
			}
			table = append(table, entry)
			if Promoted(placement) {
				promoted = append(promoted, entry)
			}
			if Relegated(placement, len(ranked)) {
				relegated = append(relegated, entry)
			}
		}
	}
	return map[string]any{"seasonKey": seasonKey, "standings": table, "promoted": promoted, "relegated": relegated}, nil
}

// GetLeagueSeason returns a season's table.
func (r *Repository) GetLeagueSeason(ctx context.Context, seasonKey string) (map[string]any, bool, error) {
	season, ok, err := scanOne(ctx, r.q, leagueSeasonColumns+` WHERE "SeasonKey" = $1`, seasonKey)
	if err != nil || !ok {
		return nil, ok, err
	}
	rows, err := scanAll(ctx, r.q, `SELECT "AssociationId", "GroupIndex", "Stars", "Placement" FROM "AssociationLeagueStandings"
		WHERE "SeasonKey" = $1 ORDER BY "GroupIndex", "Placement" NULLS LAST, "AssociationId"`, seasonKey)
	if err != nil {
		return nil, false, err
	}
	table := make([]any, 0, len(rows))
	for _, row := range rows {
		table = append(table, map[string]any{
			"associationId": db.StringField(row, "AssociationId"),
			"groupIndex":    intOf(row["GroupIndex"]),
			"stars":         intOf(row["Stars"]),
			"placement":     nullableInt(row["Placement"]),
		})
	}
	return map[string]any{
		"seasonKey": db.StringField(season, "SeasonKey"),
		"startsAt":  nullableString(season["StartsAt"]),
		"endsAt":    nullableString(season["EndsAt"]),
		"standings": table,
	}, true, nil
}

const leagueSeasonColumns = `SELECT "_id", "SeasonKey", "StartsAt", "EndsAt" FROM "AssociationLeagueSeasons"`

func nullableInt(v any) any {
	if v == nil {
		return nil
	}
	return intOf(v)
}
