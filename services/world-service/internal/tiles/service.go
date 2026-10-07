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
// prominence. When either payload cap would be exceeded the result is the
// bounded subset with Overflow/ZoomHint set (§7.4), never a silent truncation.
func (s *Service) Build(ctx context.Context, key Key) (Tile, error) {
	if !key.Valid() {
		return Tile{}, fmt.Errorf("%w: %s", ErrInvalidKey, key.String())
	}
	if s.q == nil {
		return Tile{}, errors.New("tiles: no database configured")
	}

	size := cellSize(key.Z)
	level := LevelForZoom(key.Z)
	rev, err := s.revision(ctx, key)
	if err != nil {
		return Tile{}, err
	}

	places, err := s.places(ctx, key, level, size)
	if err != nil {
		return Tile{}, err
	}
	overflow := false
	if len(places) > TileMaxPlaces {
		places = places[:TileMaxPlaces]
		overflow = true
	}

	clubCount, err := s.clubCount(ctx, key, size)
	if err != nil {
		return Tile{}, err
	}

	rows, err := s.clubs(ctx, key, size)
	if err != nil {
		return Tile{}, err
	}
	clubs := capPerPlace(rows, ClubCapForZoom(key.Z))
	if len(clubs) > TileMaxClubs {
		clubs = clubs[:TileMaxClubs]
		overflow = true
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

// places draws the level's places in the cell with their total club counts.
// The per-type count mirrors placement.Service.Children (the canonical
// traversal): a city's ParentId is its country and it links to its region via
// RegionId, so a region sums the districts of the cities whose RegionId is the
// region, and a country sums the districts of the cities whose ParentId is the
// country.
func (s *Service) places(ctx context.Context, key Key, level string, size float64) ([]PlaceMarker, error) {
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
WHERE p."Type" = $1 AND p."MapX" IS NOT NULL
  AND floor(p."MapX" / $2) = $3 AND floor(p."MapY" / $2) = $4
ORDER BY clubs DESC, p."Name"
LIMIT $5`, level, size, key.X, key.Y, TileMaxPlaces+1)
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

// clubRow is a ClubMarker plus the district it belongs to, so the per-place
// cap can be applied after the prominence-ordered fetch.
type clubRow struct {
	marker   ClubMarker
	district string
}

// clubs draws the cell's clubs by descending prominence, with the district id
// so capPerPlace can apply the per-place cap. It over-fetches (2× the tile
// cap) to leave room for the per-place cap to drop the weakest of a busy
// district before the global cap is applied.
func (s *Service) clubs(ctx context.Context, key Key, size float64) ([]clubRow, error) {
	rows, err := s.q.Query(ctx, `
SELECT c."_id"::text, c."Name", c."ClubCode", d."_id"::text AS district,
       d."MapX", d."MapY", c."Prominence", (c."UserId" IS NOT NULL) AS human
FROM "Clubs" c
JOIN "Places" d ON d."_id" = c."DistrictId"
WHERE c."ReleasedAt" IS NULL AND d."MapX" IS NOT NULL
  AND floor(d."MapX" / $1) = $2 AND floor(d."MapY" / $1) = $3
ORDER BY c."Prominence" DESC, c."_id"
LIMIT $4`, size, key.X, key.Y, TileMaxClubs*4)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]clubRow, 0, 64)
	for rows.Next() {
		var r clubRow
		if err := rows.Scan(&r.marker.ID, &r.marker.Name, &r.marker.Code, &r.district,
			&r.marker.X, &r.marker.Y, &r.marker.Prominence, &r.marker.Human); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// clubCount is the total number of clubs in the cell (not just the drawn ones).
func (s *Service) clubCount(ctx context.Context, key Key, size float64) (int, error) {
	var n int
	err := s.q.QueryRow(ctx, `
SELECT count(*)::int
FROM "Clubs" c
JOIN "Places" d ON d."_id" = c."DistrictId"
WHERE c."ReleasedAt" IS NULL AND d."MapX" IS NOT NULL
  AND floor(d."MapX" / $1) = $2 AND floor(d."MapY" / $1) = $3`,
		size, key.X, key.Y).Scan(&n)
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

// capPerPlace keeps at most cap clubs per district, preserving the incoming
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
		if seen[r.district] >= cap {
			continue
		}
		seen[r.district]++
		out = append(out, r.marker)
	}
	return out
}
