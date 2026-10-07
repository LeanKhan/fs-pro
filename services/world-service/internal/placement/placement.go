// Package placement owns where a new club lands in the country > region >
// city > district hierarchy (D1) and the hierarchy queries over it
// (docs/perfect/WORLD-HIERARCHY-SPEC.md §3-§4). It replaces the O(world) scan
// in placement.service.ts with maintained state: holes come from PlaceStats'
// indexed counter, and the frontier country/region/city is a bounded set of
// point reads, so a founding is O(1) amortised. Node keeps the founding
// transaction and PLACEMENT_LOCK; this service is a pure read/recommendation
// and must NOT take that lock (WORLD-SERVICE-CONTRACT.md §1).
package placement

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"fs-pro-world-service/internal/db"
)

// Settings are the placement capacities on Calendars (WORLD-HIERARCHY-SPEC
// §3.1, DECISIONS Q2).
type Settings struct {
	DistrictClubs       int
	CityDistricts       int
	RegionCities        int
	CountryRegions      int
	MetropolisDistricts int
}

// DefaultSettings is the Q2 default a fresh world uses.
func DefaultSettings() Settings {
	return Settings{DistrictClubs: 10, CityDistricts: 2, RegionCities: 8, CountryRegions: 6, MetropolisDistricts: 40}
}

// Invite is the invite honoured by a placement.
type Invite struct {
	PlaceID string
	Level   string
}

// Spot is the contract's PlacementSpot.
type Spot struct {
	Kind       string
	DistrictID *string
	CityID     *string
	RegionID   *string
	CountryID  *string
	NeedsNames []string
	X          float64
	Y          float64
	Invite     *Invite
}

// Child is one place in the GET /places/{id}/children response.
type Child struct {
	ID       string
	Type     string
	Name     string
	Code     string
	ParentID string
	RegionID *string
	MapX     float64
	MapY     float64
	Clubs    int
}

// Service is the DB-backed placement engine.
type Service struct {
	q db.Querier
}

// New returns a placement Service over q.
func New(q db.Querier) *Service { return &Service{q: q} }

// Settings reads the world's capacities, falling back to the Q2 defaults.
func (s *Service) Settings(ctx context.Context) (Settings, error) {
	cfg := DefaultSettings()
	var (
		dc, cd, rc, cr, md *int
	)
	err := s.q.QueryRow(ctx, `
SELECT "DistrictClubs", "CityDistricts", "RegionCities", "CountryRegions", "MetropolisDistricts"
FROM "Calendars" LIMIT 1`).Scan(&dc, &cd, &rc, &cr, &md)
	if errors.Is(err, pgx.ErrNoRows) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	if dc != nil {
		cfg.DistrictClubs = *dc
	}
	if cd != nil {
		cfg.CityDistricts = *cd
	}
	if rc != nil {
		cfg.RegionCities = *rc
	}
	if cr != nil {
		cfg.CountryRegions = *cr
	}
	if md != nil {
		cfg.MetropolisDistricts = *md
	}
	return cfg, nil
}

// Spot returns the recommended placement for a founding. clubID is used only
// for logging/future reservation; inviteToken, when set, overrides the order.
func (s *Service) Spot(ctx context.Context, clubID, inviteToken string) (Spot, error) {
	cfg, err := s.Settings(ctx)
	if err != nil {
		return Spot{}, err
	}

	if inviteToken != "" {
		inv, valid, err := s.lookupInvite(ctx, inviteToken)
		if err != nil {
			return Spot{}, err
		}
		if valid {
			spot, ok, err := s.spotForInvite(ctx, inv, cfg)
			if err != nil {
				return Spot{}, err
			}
			if ok {
				// The invite was honoured; Node counts one use.
				spot.Invite = inv
				return spot, nil
			}
			// Valid but not usable (its place is full): fall back and report
			// no invite, so Node does not count a use.
		}
	}

	spot, err := s.nextSpot(ctx, cfg)
	if err != nil {
		return Spot{}, err
	}
	return spot, nil
}

// ---------------------------------------------------------------------------
// Normal fill order
// ---------------------------------------------------------------------------

func (s *Service) nextSpot(ctx context.Context, cfg Settings) (Spot, error) {
	// 1. A hole: the oldest district below the district cap.
	if spot, ok, err := s.oldestHole(ctx, cfg.DistrictClubs); err != nil {
		return Spot{}, err
	} else if ok {
		return spot, nil
	}

	// 2-5. Grow the frontier country.
	countryID, countryPoint, ok, err := s.frontierCountry(ctx)
	if err != nil {
		return Spot{}, err
	}
	if !ok {
		return Spot{Kind: "country", NeedsNames: []string{"city", "region", "country"}, X: suggestCountrySpot(nil).X, Y: suggestCountrySpot(nil).Y}, nil
	}

	capitalID, err := s.capitalCity(ctx, countryID)
	if err != nil {
		return Spot{}, err
	}

	// 2. A new district in the frontier country's next city.
	cityID, ok, err := s.growCity(ctx, countryID, capitalID, cfg)
	if err != nil {
		return Spot{}, err
	}
	if ok {
		return s.spotForCity(ctx, cityID, cfg, countryID, countryPoint)
	}

	// 3. A new city in the newest region that still has room.
	regionID, regionPoint, ok, err := s.regionWithRoom(ctx, countryID, cfg.RegionCities)
	if err != nil {
		return Spot{}, err
	}
	if ok {
		point, found := s.suggestCity(ctx, countryID, regionID, regionPoint)
		if !found {
			point = regionPoint
		}
		return Spot{
			Kind:       "city",
			RegionID:   strp(regionID),
			CountryID:  strp(countryID),
			NeedsNames: []string{"city"},
			X:          point.X,
			Y:          point.Y,
		}, nil
	}

	// 4. A new region in the frontier country.
	count, err := s.regionCount(ctx, countryID)
	if err != nil {
		return Spot{}, err
	}
	if count < cfg.CountryRegions {
		regions, err := s.points(ctx, `SELECT "MapX","MapY" FROM "Places" WHERE "Type"='region' AND "ParentId"=$1::uuid AND "MapX" IS NOT NULL`, countryID)
		if err != nil {
			return Spot{}, err
		}
		others, err := s.otherCountryPoints(ctx, countryID)
		if err != nil {
			return Spot{}, err
		}
		point, found := suggestRegionSpot(countryPoint, regions, others, float64(count)*0.37)
		if !found {
			point = Point{countryPoint.X + 60, countryPoint.Y}
		}
		return Spot{
			Kind:       "region",
			CountryID:  strp(countryID),
			NeedsNames: []string{"city", "region"},
			X:          point.X,
			Y:          point.Y,
		}, nil
	}

	// 5. A new country.
	countries, err := s.points(ctx, `SELECT "MapX","MapY" FROM "Places" WHERE "Type"='country' AND "MapX" IS NOT NULL`)
	if err != nil {
		return Spot{}, err
	}
	point := suggestCountrySpot(countries)
	return Spot{
		Kind:       "country",
		NeedsNames: []string{"city", "region", "country"},
		X:          point.X,
		Y:          point.Y,
	}, nil
}

// oldestHole returns the oldest district with room, as kind 'hole'.
func (s *Service) oldestHole(ctx context.Context, cap int) (Spot, bool, error) {
	var (
		districtID, cityID, regionID, countryID string
		x, y                                    *float64
	)
	err := s.q.QueryRow(ctx, `
SELECT d."_id"::text, city."_id"::text, city."RegionId"::text, country."_id"::text, d."MapX", d."MapY"
FROM "PlaceStats" ps
JOIN "Places" d ON d."_id" = ps."PlaceId"
JOIN "Places" city ON city."_id" = d."ParentId"
JOIN "Places" country ON country."_id" = city."ParentId"
WHERE d."Type" = 'district' AND ps."Clubs" < $1
ORDER BY d."createdAt" ASC, d."_id" ASC
LIMIT 1`, cap).Scan(&districtID, &cityID, &regionID, &countryID, &x, &y)
	if errors.Is(err, pgx.ErrNoRows) {
		return Spot{}, false, nil
	}
	if err != nil {
		return Spot{}, false, err
	}
	return Spot{
		Kind:       "hole",
		DistrictID: strp(districtID),
		CityID:     strp(cityID),
		RegionID:   nullable(regionID),
		CountryID:  strp(countryID),
		X:          derefF(x),
		Y:          derefF(y),
	}, true, nil
}

// spotForCity returns an open district in the city, or a new district in it.
func (s *Service) spotForCity(ctx context.Context, cityID string, cfg Settings, countryID string, countryPoint Point) (Spot, error) {
	var (
		regionID string
		cityX    *float64
		cityY    *float64
	)
	err := s.q.QueryRow(ctx, `
SELECT coalesce("RegionId"::text, ''), "MapX", "MapY" FROM "Places" WHERE "_id" = $1::uuid`, cityID).
		Scan(&regionID, &cityX, &cityY)
	if err != nil {
		return Spot{}, err
	}
	cityPoint := Point{derefF(cityX), derefF(cityY)}

	// A hole inside this city first.
	var districtID string
	err = s.q.QueryRow(ctx, `
SELECT d."_id"::text FROM "PlaceStats" ps
JOIN "Places" d ON d."_id" = ps."PlaceId"
WHERE d."Type" = 'district' AND d."ParentId" = $1::uuid AND ps."Clubs" < $2
ORDER BY d."createdAt" ASC, d."_id" ASC LIMIT 1`, cityID, cfg.DistrictClubs).Scan(&districtID)
	if err == nil {
		return Spot{
			Kind:       "hole",
			DistrictID: strp(districtID),
			CityID:     strp(cityID),
			RegionID:   nullable(regionID),
			CountryID:  strp(countryID),
			X:          derefF(cityX),
			Y:          derefF(cityY),
		}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Spot{}, err
	}

	districts, err := s.points(ctx, `SELECT "MapX","MapY" FROM "Places" WHERE "Type"='district' AND "ParentId"=$1::uuid AND "MapX" IS NOT NULL`, cityID)
	if err != nil {
		return Spot{}, err
	}
	others, err := s.otherCountryPoints(ctx, countryID)
	if err != nil {
		return Spot{}, err
	}
	point, found := suggestTownSpot(countryPoint, cityPoint, districts, others, len(districts), regionRadius)
	if !found {
		point = cityPoint
	}
	return Spot{
		Kind:      "district",
		CityID:    strp(cityID),
		RegionID:  nullable(regionID),
		CountryID: strp(countryID),
		X:         point.X,
		Y:         point.Y,
	}, nil
}

// growCity returns the frontier country city that should open a district:
// fewest districts first, newest first, below its cap (the capital uses the
// metropolis cap).
func (s *Service) growCity(ctx context.Context, countryID string, capitalID *string, cfg Settings) (string, bool, error) {
	var cityID string
	err := s.q.QueryRow(ctx, `
SELECT ci."_id"::text
FROM "Places" ci
WHERE ci."Type" = 'city' AND ci."ParentId" = $1::uuid
  AND (SELECT count(*) FROM "Places" d WHERE d."Type" = 'district' AND d."ParentId" = ci."_id")
      < (CASE WHEN ci."_id" = $2::uuid THEN $3::int ELSE $4::int END)
ORDER BY (SELECT count(*) FROM "Places" d WHERE d."Type"='district' AND d."ParentId"=ci."_id") ASC,
         ci."createdAt" DESC, ci."_id" DESC
LIMIT 1`, countryID, capitalID, cfg.MetropolisDistricts, cfg.CityDistricts).Scan(&cityID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return cityID, true, nil
}

// frontierCountry returns the newest country (the only one that grows) and its
// point.
func (s *Service) frontierCountry(ctx context.Context) (string, Point, bool, error) {
	var (
		id string
		x  *float64
		y  *float64
	)
	err := s.q.QueryRow(ctx, `
SELECT "_id"::text, "MapX", "MapY" FROM "Places"
WHERE "Type" = 'country'
ORDER BY "createdAt" DESC, "_id" DESC LIMIT 1`).Scan(&id, &x, &y)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", Point{}, false, nil
	}
	if err != nil {
		return "", Point{}, false, err
	}
	return id, Point{derefF(x), derefF(y)}, true, nil
}

// capitalCity is the frontier country's capital: Calendars.FrontierCityId when
// it still belongs to the country, else its oldest city.
func (s *Service) capitalCity(ctx context.Context, countryID string) (*string, error) {
	var frontier *string
	_ = s.q.QueryRow(ctx, `SELECT "FrontierCityId"::text FROM "Calendars" LIMIT 1`).Scan(&frontier)
	if frontier != nil {
		var belongs bool
		if err := s.q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Places" WHERE "_id"=$1::uuid AND "Type"='city' AND "ParentId"=$2::uuid)`, *frontier, countryID).Scan(&belongs); err == nil && belongs {
			return frontier, nil
		}
	}
	var oldest string
	err := s.q.QueryRow(ctx, `
SELECT "_id"::text FROM "Places"
WHERE "Type"='city' AND "ParentId"=$1::uuid
ORDER BY "createdAt" ASC, "_id" ASC LIMIT 1`, countryID).Scan(&oldest)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &oldest, nil
}

func (s *Service) regionWithRoom(ctx context.Context, countryID string, regionCities int) (string, Point, bool, error) {
	var (
		id string
		x  *float64
		y  *float64
	)
	err := s.q.QueryRow(ctx, `
SELECT r."_id"::text, r."MapX", r."MapY"
FROM "Places" r
WHERE r."Type"='region' AND r."ParentId"=$1::uuid
  AND (SELECT count(*) FROM "Places" ci WHERE ci."Type"='city' AND ci."RegionId"=r."_id") < $2
ORDER BY r."createdAt" DESC, r."_id" DESC LIMIT 1`, countryID, regionCities).Scan(&id, &x, &y)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", Point{}, false, nil
	}
	if err != nil {
		return "", Point{}, false, err
	}
	return id, Point{derefF(x), derefF(y)}, true, nil
}

func (s *Service) regionCount(ctx context.Context, countryID string) (int, error) {
	var n int
	err := s.q.QueryRow(ctx, `SELECT count(*) FROM "Places" WHERE "Type"='region' AND "ParentId"=$1::uuid`, countryID).Scan(&n)
	return n, err
}

func (s *Service) suggestCity(ctx context.Context, countryID, regionID string, regionPoint Point) (Point, bool) {
	cities, err := s.points(ctx, `SELECT "MapX","MapY" FROM "Places" WHERE "Type"='city' AND "ParentId"=$1::uuid AND "MapX" IS NOT NULL`, countryID)
	if err != nil {
		return Point{}, false
	}
	others, err := s.otherCountryPoints(ctx, countryID)
	if err != nil {
		return Point{}, false
	}
	countryPoint := regionPoint
	if _, cp, ok, err := s.frontierCountry(ctx); err == nil && ok {
		countryPoint = cp
	}
	return suggestTownSpot(countryPoint, regionPoint, cities, others, len(cities), regionRadius)
}

// points runs a query whose only SELECT is two nullable real columns.
func (s *Service) points(ctx context.Context, sql string, args ...any) ([]Point, error) {
	rows, err := s.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Point
	for rows.Next() {
		var x, y *float64
		if err := rows.Scan(&x, &y); err != nil {
			return nil, err
		}
		if x != nil && y != nil {
			out = append(out, Point{*x, *y})
		}
	}
	return out, rows.Err()
}

func (s *Service) otherCountryPoints(ctx context.Context, exclude string) ([]Point, error) {
	return s.points(ctx, `SELECT "MapX","MapY" FROM "Places" WHERE "Type"='country' AND "MapX" IS NOT NULL AND "_id" <> $1::uuid`, exclude)
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

func (s *Service) lookupInvite(ctx context.Context, token string) (*Invite, bool, error) {
	var (
		placeID       string
		level         string
		expiresAt     pgtype.Timestamptz
		maxUses, uses int
	)
	err := s.q.QueryRow(ctx, `
SELECT "PlaceId"::text, "Level", "ExpiresAt", "MaxUses", "Uses"
FROM "PlaceInvites" WHERE "Token" = $1`, token).Scan(&placeID, &level, &expiresAt, &maxUses, &uses)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if expiresAt.Time.Before(time.Now()) || uses >= maxUses {
		return nil, false, nil
	}
	return &Invite{PlaceID: placeID, Level: level}, true, nil
}

// spotForInvite tries the invite's district/city, then falls back.
func (s *Service) spotForInvite(ctx context.Context, inv *Invite, cfg Settings) (Spot, bool, error) {
	switch inv.Level {
	case "city":
		countryID, countryPoint, err := s.countryOfCity(ctx, inv.PlaceID)
		if err != nil {
			return Spot{}, false, nil
		}
		spot, err := s.spotForCity(ctx, inv.PlaceID, cfg, countryID, countryPoint)
		if err != nil {
			return Spot{}, false, err
		}
		return spot, true, nil
	case "district":
		var cityID string
		err := s.q.QueryRow(ctx, `SELECT "ParentId"::text FROM "Places" WHERE "_id"=$1::uuid AND "Type"='district'`, inv.PlaceID).Scan(&cityID)
		if errors.Is(err, pgx.ErrNoRows) {
			return Spot{}, false, nil
		}
		if err != nil {
			return Spot{}, false, err
		}
		countryID, countryPoint, err := s.countryOfCity(ctx, cityID)
		if err != nil {
			return Spot{}, false, nil
		}
		// The invited district itself first.
		var room bool
		_ = s.q.QueryRow(ctx, `SELECT coalesce((SELECT "Clubs" FROM "PlaceStats" WHERE "PlaceId"=$1::uuid), 0) < $2`, inv.PlaceID, cfg.DistrictClubs).Scan(&room)
		if room {
			var regionID *string
			_ = s.q.QueryRow(ctx, `SELECT "RegionId"::text FROM "Places" WHERE "_id"=$1::uuid`, cityID).Scan(&regionID)
			var x, y *float64
			_ = s.q.QueryRow(ctx, `SELECT "MapX","MapY" FROM "Places" WHERE "_id"=$1::uuid`, inv.PlaceID).Scan(&x, &y)
			return Spot{
				Kind:       "hole",
				DistrictID: strp(inv.PlaceID),
				CityID:     strp(cityID),
				RegionID:   regionID,
				CountryID:  strp(countryID),
				X:          derefF(x),
				Y:          derefF(y),
			}, true, nil
		}
		spot, err := s.spotForCity(ctx, cityID, cfg, countryID, countryPoint)
		if err != nil {
			return Spot{}, false, err
		}
		return spot, true, nil
	}
	return Spot{}, false, nil
}

func (s *Service) countryOfCity(ctx context.Context, cityID string) (string, Point, error) {
	var (
		countryID string
		x, y      *float64
	)
	err := s.q.QueryRow(ctx, `
SELECT country."_id"::text, country."MapX", country."MapY"
FROM "Places" city
JOIN "Places" country ON country."_id" = city."ParentId"
WHERE city."_id" = $1::uuid`, cityID).Scan(&countryID, &x, &y)
	if err != nil {
		return "", Point{}, err
	}
	return countryID, Point{derefF(x), derefF(y)}, nil
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

// Children returns the direct children of placeID, optionally filtered by
// type ("region" | "city" | "district"). `clubs` is summed from PlaceStats.
func (s *Service) Children(ctx context.Context, placeID, kind string) ([]Child, error) {
	rows, err := s.q.Query(ctx, `
SELECT p."_id"::text, p."Type", p."Name", p."Code",
       p."ParentId"::text, p."RegionId"::text,
       coalesce(p."MapX", 0), coalesce(p."MapY", 0),
       CASE p."Type"
         WHEN 'district' THEN coalesce((SELECT ps."Clubs" FROM "PlaceStats" ps WHERE ps."PlaceId" = p."_id"), 0)
         WHEN 'city' THEN coalesce((SELECT sum(ps."Clubs") FROM "PlaceStats" ps JOIN "Places" d ON d."_id" = ps."PlaceId" WHERE d."ParentId" = p."_id"), 0)
         WHEN 'region' THEN coalesce((SELECT sum(ps."Clubs") FROM "PlaceStats" ps JOIN "Places" d ON d."_id" = ps."PlaceId" JOIN "Places" ci ON ci."_id" = d."ParentId" WHERE ci."RegionId" = p."_id"), 0)
         ELSE 0
       END
FROM "Places" p
WHERE p."ParentId" = $1::uuid AND ($2 = '' OR p."Type" = $2)
ORDER BY p."createdAt" ASC, p."_id" ASC`, placeID, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Child{}
	for rows.Next() {
		var c Child
		if err := rows.Scan(&c.ID, &c.Type, &c.Name, &c.Code, &c.ParentID, &c.RegionID, &c.MapX, &c.MapY, &c.Clubs); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

func strp(s string) *string { return &s }

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func derefF(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}
