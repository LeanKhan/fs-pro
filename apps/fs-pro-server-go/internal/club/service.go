package club

import (
	"context"
	"strconv"
	"strings"

	"fs-pro-server/internal/db"
)

func itoa(n int) string { return strconv.Itoa(n) }

func joinAnd(conditions []string) string { return strings.Join(conditions, " AND ") }

// Ratings recompute, ported from club.service.ts's
// calculateClubsTotalRatings / calculateAndUpdateClubRating.

type positionRating struct {
	position  string
	avgRating float64
}

func (r *Repository) positionRatings(ctx context.Context, clubID string) ([]positionRating, error) {
	rows, err := r.q.Query(ctx, `SELECT "Position", avg("Rating") AS avg_rating
		FROM "Players" WHERE "ClubId" = $1 GROUP BY "Position"`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]positionRating, 0, len(list))
	for _, m := range list {
		out = append(out, positionRating{
			position:  db.StringField(m, "Position"),
			avgRating: number(m["avg_rating"]),
		})
	}
	return out, nil
}

// CalculateAndUpdateClubRating recomputes Rating/AttackingClass/DefensiveClass
// and the per-position `*_Rating` columns from the club's squad and persists
// them, returning the updated club.
func (r *Repository) CalculateAndUpdateClubRating(ctx context.Context, clubID string) (map[string]any, bool, error) {
	ratings, err := r.positionRatings(ctx, clubID)
	if err != nil {
		return nil, false, err
	}
	return r.Update(ctx, clubID, ratingUpdate(ratings))
}

// ratingUpdate mirrors the Node math exactly (given avg ratings per position).
func ratingUpdate(ratings []positionRating) map[string]any {
	sum := 0.0
	for _, r := range ratings {
		sum += r.avgRating
	}
	attClass := ratingFor(ratings, "ATT") + ratingFor(ratings, "MID")/2
	defClass := ratingFor(ratings, "GK") + ratingFor(ratings, "DEF")/2
	avgTotal := 0.0
	if sum != 0 {
		avgTotal = sum / float64(len(ratings))
	}
	data := map[string]any{
		"Rating":         avgTotal,
		"AttackingClass": attClass,
		"DefensiveClass": defClass,
	}
	for _, r := range ratings {
		switch r.position {
		case "GK", "DEF", "MID", "ATT":
			data[r.position+"_Rating"] = r.avgRating
		}
	}
	return data
}

func ratingFor(ratings []positionRating, position string) float64 {
	for _, r := range ratings {
		if r.position == position {
			return r.avgRating
		}
	}
	return 0
}

// RefreshAll recalculates every club's rating in batches of 25, mirroring
// refreshAllClubsRatings.
func (r *Repository) RefreshAll(ctx context.Context) error {
	clubs, err := r.FindAll(ctx, Filter{}, ReadOptions{})
	if err != nil {
		return err
	}
	for i := 0; i < len(clubs); i += 25 {
		end := i + 25
		if end > len(clubs) {
			end = len(clubs)
		}
		for _, c := range clubs[i:end] {
			if _, _, err := r.CalculateAndUpdateClubRating(ctx, db.StringField(c, "_id")); err != nil {
				return err
			}
		}
	}
	return nil
}

func number(v any) float64 {
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
