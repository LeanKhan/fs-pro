package tiles

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"fs-pro-world-service/internal/db"
)

// Service is the DB-backed tile Builder.
type Service struct {
	q db.Querier
}

// New returns a tile Builder backed by q.
func New(q db.Querier) *Service { return &Service{q: q} }

// Build returns the bounded tile for key. It draws the places at the zoom's
// level that fall in the cell, each with its club count, plus the top clubs by
// prominence. When a cap would be exceeded it returns the cell's parent-level
// summary with Overflow/ZoomHint set (§7.4) rather than a silent truncation;
// at z0 (no parent) it returns the bounded subset with the flags set.
func (s *Service) Build(ctx context.Context, key Key) (Tile, error) {
	if !key.Valid() {
		return Tile{}, fmt.Errorf("%w: %s", ErrInvalidKey, key.String())
	}
	if s.q == nil {
		return Tile{}, errors.New("tiles: no database configured")
	}

	level := LevelForZoom(key.Z)
	rev, err := s.revision(ctx, key)
	if err != nil {
		return Tile{}, err
	}

	places, err := s.places(ctx, key, level)
	if err != nil {
		return Tile{}, err
	}
	overflow := false
	if len(places) > TileMaxPlaces {
		places = places[:TileMaxPlaces]
		overflow = true
	}

	clubCount, err := s.clubCount(ctx, key)
	if err != nil {
		return Tile{}, err
	}

	rows, err := s.clubs(ctx, key, level)
	if err != nil {
		return Tile{}, err
	}
	clubs := capPerPlace(rows, ClubCapForZoom(key.Z))
	if len(clubs) > TileMaxClubs {
		clubs = clubs[:TileMaxClubs]
		overflow = true
	}

	if overflow && key.Z > MinZ {
		// Return the parent-level summary; the client zooms in.
		parent := Key{Z: key.Z - 1, X: key.X / 2, Y: key.Y / 2}
		summary, err := s.Build(ctx, parent)
		if err != nil {
			return Tile{}, err
		}
		summary.Overflow = true
		summary.ZoomHint = true
		return summary, nil
	}

	if places == nil {
		places = []PlaceMarker{}
	}
	if clubs == nil {
		clubs = []ClubMarker{}
	}
	return Tile{
		Key:       key,
		Places:    places,
		Clubs:     clubs,
		ClubCount: clubCount,
		Overflow:  overflow,
		ZoomHint:  overflow,
		Rev:       rev,
	}, nil
}

// bounds returns the inclusive-exclusive atlas box of a cell, so the queries
// use a sargable range on MapX/MapY (index-friendly) instead of a computed
// floor() predicate.
func bounds(key Key) (x0, x1, y0, y1 float64) {
	size := cellSize(key.Z)
	x0 = float64(key.X) * size
	y0 = float64(key.Y) * size
	return x0, x0 + size, y0, y0 + size
}

// places draws the level's places in the cell with their total club counts.
// At z5 the level is "club": clubs are drawn individually and there is no
// place marker, so it returns nothing. The per-type count mirrors
// placement.Service.Children (the canonical traversal): a city's ParentId is
// its country and it links to its region via RegionId, so a region sums the
// districts of the cities whose RegionId is the region, and a country sums the
// districts of the cities whose ParentId is the country.
func (s *Service) places(ctx context.Context, key Key, level string) ([]PlaceMarker, error) {
	if level == "club" {
		return []PlaceMarker{}, nil
	}
	x0, x1, y0, y1 := bounds(key)
	rows, err := s.q.Query(ctx, `
SELECT p."_id"::text, p."Name", p."Type", p."MapX", p."MapY",
       CASE p."Type"
         WHEN 'district' THEN coalesce((SELECT ps."Clubs" FROM "PlaceStats" ps WHERE ps."PlaceId" = p."_id"), 0)
         WHEN 'city' THEN coalesce((SELECT sum(ps."Clubs") FROM "PlaceStats" ps JOIN "Places" d ON d."_id" = ps."PlaceId" WHERE d."ParentId" = p."_id"), 0)
         WHEN 'region' THEN coalesce((SELECT sum(ps."Clubs") FROM "PlaceStats" ps JOIN "Places" d ON d."_id" = ps."PlaceId" JOIN "Places" ci ON ci."_id" = d."ParentId" WHERE ci."RegionId" = p."_id"), 0)
         WHEN 'country' THEN coalesce((SELECT sum(ps."Clubs") FROM "PlaceStats" ps JOIN "Places" d ON d."_id" = ps."PlaceId" JOIN "Places" ci ON ci."_id" = d."ParentId" WHERE ci."ParentId" = p."_id"), 0)
         ELSE 0
       END AS clubs
FROM "Places" p
WHERE p."Type" = $5 AND p."MapX" IS NOT NULL
  AND p."MapX" >= $1 AND p."MapX" < $2 AND p."MapY" >= $3 AND p."MapY" < $4
ORDER BY clubs DESC, p."Name"
LIMIT $6`, x0, x1, y0, y1, level, TileMaxPlaces+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]PlaceMarker, 0, 64)
	for rows.Next() {
		var m PlaceMarker
		if err := rows.Scan(&m.ID, &m.Name, &m.Type, &m.X, &m.Y, &m.Clubs); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// clubRow is a ClubMarker plus the place it belongs to at the tile's zoom, so
// the per-place cap can be applied after the prominence-ordered fetch.
type clubRow struct {
	marker ClubMarker
	place  string
}

// ancestorExpr maps a club's district to the place drawn at the zoom's level:
// the country is the district's city's ParentId, the region is that city's
// RegionId, the city is the district's ParentId, otherwise the district itself.
const ancestorExpr = `CASE $5
  WHEN 'country' THEN ci."ParentId"::text
  WHEN 'region' THEN ci."RegionId"::text
  WHEN 'city' THEN d."ParentId"::text
  ELSE d."_id"::text
END`

// clubs draws the cell's clubs by descending prominence, tagged with the place
// they belong to at this zoom so capPerPlace can apply the per-place cap.
func (s *Service) clubs(ctx context.Context, key Key, level string) ([]clubRow, error) {
	x0, x1, y0, y1 := bounds(key)
	rows, err := s.q.Query(ctx, `
SELECT c."_id"::text, c."Name", c."ClubCode", `+ancestorExpr+` AS place,
       d."MapX", d."MapY", c."Prominence", (c."UserId" IS NOT NULL) AS human
FROM "Clubs" c
JOIN "Places" d ON d."_id" = c."DistrictId"
JOIN "Places" ci ON ci."_id" = d."ParentId"
WHERE c."ReleasedAt" IS NULL AND d."MapX" IS NOT NULL
  AND d."MapX" >= $1 AND d."MapX" < $2 AND d."MapY" >= $3 AND d."MapY" < $4
ORDER BY c."Prominence" DESC, c."_id"
LIMIT $6`, x0, x1, y0, y1, level, TileMaxClubs*8)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]clubRow, 0, 64)
	for rows.Next() {
		var r clubRow
		if err := rows.Scan(&r.marker.ID, &r.marker.Name, &r.marker.Code, &r.place,
			&r.marker.X, &r.marker.Y, &r.marker.Prominence, &r.marker.Human); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// clubCount is the total number of clubs in the cell (not just the drawn ones).
func (s *Service) clubCount(ctx context.Context, key Key) (int, error) {
	x0, x1, y0, y1 := bounds(key)
	var n int
	err := s.q.QueryRow(ctx, `
SELECT count(*)::int
FROM "Clubs" c
JOIN "Places" d ON d."_id" = c."DistrictId"
WHERE c."ReleasedAt" IS NULL AND d."MapX" IS NOT NULL
  AND d."MapX" >= $1 AND d."MapX" < $2 AND d."MapY" >= $3 AND d."MapY" < $4`,
		x0, x1, y0, y1).Scan(&n)
	return n, err
}

// revision reads the TileRevisions counter for the key (0 when absent).
func (s *Service) revision(ctx context.Context, key Key) (int64, error) {
	var rev int64
	err := s.q.QueryRow(ctx,
		`SELECT coalesce((SELECT rev FROM "TileRevisions" WHERE z=$1 AND x=$2 AND y=$3), 0)`,
		key.Z, key.X, key.Y).Scan(&rev)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	return rev, err
}

// BumpRevisions increments the counter for every cell that contains (x, y),
// from z0 through MaxZ (§7.5). Call it in the same transaction as a change to
// a club or place.
func BumpRevisions(ctx context.Context, q db.Querier, x, y float64) error {
	for z := MinZ; z <= MaxZ; z++ {
		cx, cy := CellAt(x, y, z)
		if _, err := q.Exec(ctx, `
INSERT INTO "TileRevisions" (z, x, y, rev) VALUES ($1, $2, $3, 1)
ON CONFLICT (z, x, y) DO UPDATE SET rev = "TileRevisions".rev + 1`, z, cx, cy); err != nil {
			return err
		}
	}
	return nil
}

// capPerPlace keeps at most cap clubs per drawn place, preserving the incoming
// prominence order. cap <= 0 means no per-place limit (z5 draws them all).
func capPerPlace(rows []clubRow, cap int) []ClubMarker {
	if cap <= 0 {
		out := make([]ClubMarker, 0, len(rows))
		for _, r := range rows {
			out = append(out, r.marker)
		}
		return out
	}
	seen := make(map[string]int, 32)
	out := make([]ClubMarker, 0, cap*4)
	for _, r := range rows {
		if seen[r.place] >= cap {
			continue
		}
		seen[r.place]++
		out = append(out, r.marker)
	}
	return out
}
