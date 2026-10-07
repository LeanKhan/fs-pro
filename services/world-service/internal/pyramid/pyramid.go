// Package pyramid assigns clubs to divisions and pools for a country's
// pyramid (docs/perfect/WORLD-HIERARCHY-SPEC.md §6, docs/WORLD-PYRAMID-SPEC.md).
// The pure Assign function mirrors pyramid.service.ts's shape so small worlds
// stay at parity (Batch 2B's parity test); the DB-backed Draw and Join read
// the stored clubs/entries and return the assignment for Node to persist.
package pyramid

import (
	"context"
	"errors"
	"math"
	"slices"
	"sort"
	"strconv"

	"github.com/jackc/pgx/v5"

	"fs-pro-world-service/internal/db"
)

// Defaults from DEFAULT_PYRAMID_STAGE (pyramid.service.ts:53-60).
const (
	DefaultPoolSize   = 10
	DefaultBottomFill = 0.8
	DefaultMaxDiv     = 20
)

// ErrNoEdition means the competition has no running pyramid edition.
var ErrNoEdition = errors.New("pyramid: no running edition")

// Club is the input to pool assignment: which country/region/city/district it
// belongs to, the division it is entering, and the strength fields the draw
// orders by.
type Club struct {
	ClubID      string
	CountryID   string
	RegionID    string
	CityID      string
	DistrictID  string
	Division    int
	Desired     int
	HasDesired  bool
	Level       int
	XP          int
	Elo         float64
	Prominence  float64
	RegionKey   string
	CityKey     string
	DistrictKey string
}

// Pool is one assigned pool. Number is the order within the division.
type Pool struct {
	Division    int
	Number      int
	RegionID    string
	RegionKey   string
	CityKey     string
	DistrictKey string
	ClubIDs     []string
}

// Assignment is the draw result for one edition.
type Assignment struct {
	Pools []Pool
}

// Options tune locality (pool by region > city > district) and pool size.
type Options struct {
	PoolSize   int
	MaxDiv     int
	BottomFill float64
}

func (o Options) normalized() Options {
	if o.PoolSize <= 0 {
		o.PoolSize = DefaultPoolSize
	}
	if o.MaxDiv <= 0 {
		o.MaxDiv = DefaultMaxDiv
	}
	if o.BottomFill <= 0 || o.BottomFill >= 1 {
		o.BottomFill = DefaultBottomFill
	}
	return o
}

// DivisionShape is one division's slice of the pyramid.
type DivisionShape struct {
	Division  int
	Clubs     int
	PoolSizes []int
	PoolClubs []int
}

// Shape mirrors pyramidShape() (pyramid.service.ts:104-128): full divisions
// top down (division d has 2^(d-1) pools of poolSize) while at least 2 clubs
// would be left for the next one; the rest make the bottom division.
func Shape(n, poolSize int, bottomFill float64) []DivisionShape {
	o := Options{PoolSize: poolSize, BottomFill: bottomFill}.normalized()
	poolSize, bottomFill = o.PoolSize, o.BottomFill

	if n <= 0 {
		return []DivisionShape{{Division: 1, Clubs: 0, PoolSizes: []int{poolSize}, PoolClubs: []int{0}}}
	}
	if n <= poolSize+1 {
		return []DivisionShape{{Division: 1, Clubs: n, PoolSizes: []int{max(poolSize, n)}, PoolClubs: []int{n}}}
	}

	var out []DivisionShape
	rest := n
	for d := 1; ; d++ {
		pools := 1 << (d - 1)
		cap := pools * poolSize
		if rest-cap >= 2 {
			out = append(out, DivisionShape{
				Division:  d,
				Clubs:     cap,
				PoolSizes: filled(pools, poolSize),
				PoolClubs: filled(pools, poolSize),
			})
			rest -= cap
			continue
		}
		bottomPools := 1
		if d != 1 {
			bottomPools = max(1, int(math.Ceil(float64(rest)/(float64(poolSize)*bottomFill))))
		}
		base := rest / bottomPools
		extra := rest % bottomPools
		poolClubs := make([]int, bottomPools)
		for i := range poolClubs {
			poolClubs[i] = base
			if i < extra {
				poolClubs[i]++
			}
		}
		out = append(out, DivisionShape{
			Division:  d,
			Clubs:     rest,
			PoolSizes: filled(bottomPools, poolSize),
			PoolClubs: poolClubs,
		})
		return out
	}
}

// Assign orders clubs (desired, Level, XP, Elo), cuts them into the Shape's
// divisions, and within each division cuts local pools by the §6.2 key. The
// bottom division is power-banded first (§6.5) so a mid-season joiner meets
// weak clubs; for a bottom division that fits in one band this is exactly the
// old whole-division locality cut.
func Assign(ctx context.Context, clubs []Club, opts Options) (Assignment, error) {
	o := opts.normalized()
	ordered := make([]Club, len(clubs))
	copy(ordered, clubs)
	slices.SortFunc(ordered, compareDrawStrength)

	shape := Shape(len(ordered), o.PoolSize, o.BottomFill)
	bandCapacity := o.PoolSize * int(math.Ceil(1/(1-o.BottomFill)))

	// One backing array for every pool's ids, so a draw allocates one slice,
	// not one per pool.
	allIDs := make([]string, len(ordered))
	idAt := 0

	regionCounts := make(map[string]int)
	cityCounts := make(map[string]int)
	districtCounts := make(map[string]int)

	var pools []Pool
	cursor := 0
	for di, div := range shape {
		inDivision := ordered[cursor : cursor+div.Clubs]
		cursor += div.Clubs

		if di == len(shape)-1 && bandCapacity > 0 && len(inDivision) > bandCapacity {
			// Power bands: band locally so strong and weak clubs don't mix.
			for start := 0; start < len(inDivision); start += bandCapacity {
				end := min(start+bandCapacity, len(inDivision))
				slices.SortFunc(inDivision[start:end], compareLocality)
			}
		} else {
			slices.SortFunc(inDivision, compareLocality)
		}

		at := 0
		for i, n := range div.PoolClubs {
			end := at + n
			if end > len(inDivision) {
				end = len(inDivision)
			}
			members := inDivision[at:end]
			at = end
			if len(members) == 0 {
				continue
			}
			ids := allIDs[idAt : idAt+len(members)]
			for j, m := range members {
				ids[j] = m.ClubID
			}
			idAt += len(members)
			pools = append(pools, Pool{
				Division:    div.Division,
				Number:      i,
				RegionID:    mostCommonRegion(members, regionCounts),
				RegionKey:   mostCommonKey(members, regionCounts, func(c Club) string { return c.RegionKey }),
				CityKey:     mostCommonKey(members, cityCounts, func(c Club) string { return c.CityKey }),
				DistrictKey: mostCommonKey(members, districtCounts, func(c Club) string { return c.DistrictKey }),
				ClubIDs:     ids,
			})
		}
	}
	return Assignment{Pools: pools}, ctx.Err()
}

func compareDrawStrength(a, b Club) int {
	// Desired division sorts ascending (lowest first); new clubs have +Inf and
	// therefore sort last. Strength fields sort descending (best first).
	if c := compareFloat(desiredKey(b), desiredKey(a)); c != 0 {
		return c
	}
	if a.Level != b.Level {
		return compareInt(a.Level, b.Level)
	}
	if a.XP != b.XP {
		return compareInt(a.XP, b.XP)
	}
	if a.Elo != b.Elo {
		return compareFloat(a.Elo, b.Elo)
	}
	return compareString(a.ClubID, b.ClubID)
}

func compareLocality(a, b Club) int {
	if a.RegionKey != b.RegionKey {
		return compareString(a.RegionKey, b.RegionKey)
	}
	if a.CityKey != b.CityKey {
		return compareString(a.CityKey, b.CityKey)
	}
	if a.DistrictKey != b.DistrictKey {
		return compareString(a.DistrictKey, b.DistrictKey)
	}
	return compareString(a.ClubID, b.ClubID)
}

// compareInt orders descending (higher first).
func compareInt(a, b int) int {
	switch {
	case a > b:
		return -1
	case a < b:
		return 1
	}
	return 0
}

// compareFloat orders descending (higher first).
func compareFloat(a, b float64) int {
	switch {
	case a > b:
		return -1
	case a < b:
		return 1
	}
	return 0
}

// compareString orders ascending.
func compareString(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

func desiredKey(c Club) float64 {
	if !c.HasDesired || c.Desired <= 0 {
		return math.Inf(1) // new clubs sort last (pyramid.service.ts:312)
	}
	return float64(c.Desired)
}

func mostCommonKey(clubs []Club, counts map[string]int, key func(Club) string) string {
	clear(counts)
	best, bestN := "", 0
	for _, c := range clubs {
		k := key(c)
		if k == "" {
			continue
		}
		counts[k]++
		if counts[k] > bestN {
			best, bestN = k, counts[k]
		}
	}
	return best
}

func mostCommonRegion(clubs []Club, counts map[string]int) string {
	clear(counts)
	best, bestN := "", 0
	for _, c := range clubs {
		if c.RegionID == "" {
			continue
		}
		counts[c.RegionID]++
		if counts[c.RegionID] > bestN {
			best, bestN = c.RegionID, counts[c.RegionID]
		}
	}
	return best
}

func filled(n, v int) []int {
	out := make([]int, n)
	for i := range out {
		out[i] = v
	}
	return out
}

// LocalityKeys builds padded creation-order keys for a set of places, keyed by
// place id. It mirrors pyramid.service.ts:285-300.
type localityKeys struct {
	region   map[string]string
	city     map[string]string
	district map[string]string
}

// ---------------------------------------------------------------------------
// DB-backed draw
// ---------------------------------------------------------------------------

// Service reads a country's clubs and returns the pool assignment.
type Service struct {
	q db.Querier
}

// New returns a DB-backed assigner.
func New(q db.Querier) *Service { return &Service{q: q} }

// Draw returns the ordered pool assignment for one competition's country.
func (s *Service) Draw(ctx context.Context, competitionID string) (Assignment, error) {
	var (
		countryID  string
		poolSize   int
		bottomFill float64
	)
	err := s.q.QueryRow(ctx, `
SELECT c."Entry"->'countryIds'->>0,
       coalesce((c."Stages"->0->>'poolSize')::int, 10),
       coalesce((c."Stages"->0->>'bottomFill')::float8, 0.8)
FROM "Competitions" c WHERE c."_id" = $1::uuid`, competitionID).
		Scan(&countryID, &poolSize, &bottomFill)
	if errors.Is(err, pgx.ErrNoRows) {
		return Assignment{}, ErrNoEdition
	}
	if err != nil {
		return Assignment{}, err
	}

	rows, err := s.q.Query(ctx, `
SELECT cl."_id"::text, cl."XP", cl."Elo",
       d."ParentId"::text, d."RegionId"::text, cl."DistrictId"::text
FROM "Clubs" cl
LEFT JOIN "Places" d ON d."_id" = cl."DistrictId"
WHERE cl."AddressCountryId" = $1::uuid AND cl."ReleasedAt" IS NULL`, countryID)
	if err != nil {
		return Assignment{}, err
	}
	defer rows.Close()

	var clubs []Club
	for rows.Next() {
		var (
			clubID     string
			xp         int
			elo        float64
			cityID     *string
			regionID   *string
			districtID *string
		)
		if err := rows.Scan(&clubID, &xp, &elo, &cityID, &regionID, &districtID); err != nil {
			return Assignment{}, err
		}
		c := Club{ClubID: clubID, CountryID: countryID, XP: xp, Elo: elo}
		if cityID != nil {
			c.CityID = *cityID
		}
		if regionID != nil {
			c.RegionID = *regionID
		}
		if districtID != nil {
			c.DistrictID = *districtID
		}
		c.Level = levelFromXP(xp)
		clubs = append(clubs, c)
	}
	if err := rows.Err(); err != nil {
		return Assignment{}, err
	}

	desired, err := s.desiredDivisions(ctx, competitionID)
	if err != nil {
		return Assignment{}, err
	}
	for i := range clubs {
		if d, ok := desired[clubs[i].ClubID]; ok {
			clubs[i].Desired = d
			clubs[i].HasDesired = true
		}
	}

	keys, err := s.localityKeys(ctx, countryID, clubs)
	if err != nil {
		return Assignment{}, err
	}
	for i := range clubs {
		clubs[i].RegionKey = keys.region[clubs[i].RegionID]
		clubs[i].CityKey = keys.city[clubs[i].CityID]
		clubs[i].DistrictKey = keys.district[clubs[i].DistrictID]
	}

	return Assign(ctx, clubs, Options{PoolSize: poolSize, BottomFill: bottomFill})
}

// desiredDivisions maps a club to its next division from the last finished
// edition (pyramid.service.ts:174-187).
func (s *Service) desiredDivisions(ctx context.Context, competitionID string) (map[string]int, error) {
	var last string
	err := s.q.QueryRow(ctx, `
SELECT "_id"::text FROM "Seasons"
WHERE "CompetitionId" = $1::uuid AND "Status" = 'finished'
ORDER BY "EditionNumber" DESC NULLS LAST LIMIT 1`, competitionID).Scan(&last)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]int{}, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.q.Query(ctx, `
SELECT "ClubId"::text, "Division", "Movement" FROM "Entries"
WHERE "SeasonId" = $1::uuid AND "Division" IS NOT NULL`, last)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var (
			clubID   string
			division int
			movement *int
		)
		if err := rows.Scan(&clubID, &division, &movement); err != nil {
			return nil, err
		}
		m := 0
		if movement != nil {
			m = *movement
		}
		out[clubID] = max(1, division-m)
	}
	return out, rows.Err()
}

// localityKeys assigns each place a padded creation-order key, mirroring
// pyramid.service.ts:285-300 so small-world draws match.
func (s *Service) localityKeys(ctx context.Context, countryID string, clubs []Club) (localityKeys, error) {
	keys := localityKeys{region: map[string]string{}, city: map[string]string{}, district: map[string]string{}}

	regions, err := s.placesByType(ctx, countryID, "region")
	if err != nil {
		return keys, err
	}
	for i, id := range regions {
		keys.region[id] = pad(i)
	}

	cityIDs := distinct(func() []string {
		out := make([]string, 0, len(clubs))
		for _, c := range clubs {
			out = append(out, c.CityID)
		}
		return out
	}())
	for i, id := range s.orderByCreated(ctx, cityIDs) {
		keys.city[id] = pad(i)
	}

	districtIDs := distinct(func() []string {
		out := make([]string, 0, len(clubs))
		for _, c := range clubs {
			out = append(out, c.DistrictID)
		}
		return out
	}())
	for i, id := range s.orderByCreated(ctx, districtIDs) {
		keys.district[id] = pad(i)
	}
	return keys, nil
}

func (s *Service) placesByType(ctx context.Context, countryID, typ string) ([]string, error) {
	rows, err := s.q.Query(ctx, `
SELECT "_id"::text FROM "Places"
WHERE "Type" = $2 AND "ParentId" = $1::uuid
ORDER BY "createdAt" ASC, "_id" ASC`, countryID, typ)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// orderByCreated returns ids in place-creation order; on error it keeps the
// input order (a stable fallback).
func (s *Service) orderByCreated(ctx context.Context, ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	rows, err := s.q.Query(ctx, `
SELECT "_id"::text FROM "Places" WHERE "_id" = ANY($1::uuid[])
ORDER BY "createdAt" ASC, "_id" ASC`, ids)
	if err != nil {
		return ids
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return ids
		}
		out = append(out, id)
	}
	if len(out) == 0 {
		return ids
	}
	return out
}

func pad(n int) string {
	s := strconv.Itoa(n)
	const width = 6
	for len(s) < width {
		s = "0" + s
	}
	return s
}

func distinct(ids []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, id := range ids {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

func levelFromXP(xp int) int {
	// Default 100*n^2 curve; Draw only needs an ordering hint, so a compact
	// integer curve is enough.
	if xp <= 0 {
		return 0
	}
	return int(math.Sqrt(float64(xp) / 100.0))
}

// ---------------------------------------------------------------------------
// Mid-season join
// ---------------------------------------------------------------------------

// JoinResult is the contract's POST /pyramid/join response.
type JoinResult struct {
	Division int
	PoolID   *string
	Slot     int
	NewPool  bool
}

// Join finds the bottom-division slot for a mid-season joiner. Pools carry
// only RegionId, so locality preference is region-level here (district/city
// pool columns are a later refinement); among equally local pools it takes the
// weakest (most-used, highest-numbered) one. Reads only; Node persists.
func (s *Service) Join(ctx context.Context, competitionID, clubID string) (JoinResult, error) {
	var seasonID string
	err := s.q.QueryRow(ctx, `
SELECT "_id"::text FROM "Seasons"
WHERE "CompetitionId" = $1::uuid AND "Status" = 'running'
ORDER BY "EditionNumber" DESC NULLS LAST LIMIT 1`, competitionID).Scan(&seasonID)
	if errors.Is(err, pgx.ErrNoRows) {
		return JoinResult{}, ErrNoEdition
	}
	if err != nil {
		return JoinResult{}, err
	}

	// Already entered?
	var existingPool *string
	var existingDivision *int
	err = s.q.QueryRow(ctx, `
SELECT "Group", "Division" FROM "Entries"
WHERE "SeasonId" = $1::uuid AND "ClubId" = $2::uuid LIMIT 1`, seasonID, clubID).
		Scan(&existingPool, &existingDivision)
	if err == nil && existingPool != nil {
		div := 1
		if existingDivision != nil {
			div = *existingDivision
		}
		return JoinResult{Division: div, PoolID: existingPool}, nil
	}

	var clubRegion *string
	err = s.q.QueryRow(ctx, `
SELECT d."RegionId"::text
FROM "Clubs" cl
LEFT JOIN "Places" d ON d."_id" = cl."DistrictId"
WHERE cl."_id" = $1::uuid`, clubID).Scan(&clubRegion)
	if errors.Is(err, pgx.ErrNoRows) {
		return JoinResult{}, ErrNoEdition
	}
	if err != nil {
		return JoinResult{}, err
	}

	rows, err := s.q.Query(ctx, `
SELECT p."_id"::text, p."Division", p."Size", p."Number", p."RegionId"::text,
       (SELECT count(*) FROM "Entries" e WHERE e."SeasonId" = p."SeasonId" AND e."Group" = p."_id"::text)
FROM "Pools" p WHERE p."SeasonId" = $1::uuid`, seasonID)
	if err != nil {
		return JoinResult{}, err
	}
	defer rows.Close()

	type poolRow struct {
		id       string
		division int
		size     int
		number   int
		regionID *string
		used     int
	}
	var all []poolRow
	bottom := 0
	for rows.Next() {
		var p poolRow
		if err := rows.Scan(&p.id, &p.division, &p.size, &p.number, &p.regionID, &p.used); err != nil {
			return JoinResult{}, err
		}
		if p.division > bottom {
			bottom = p.division
		}
		all = append(all, p)
	}
	if err := rows.Err(); err != nil {
		return JoinResult{}, err
	}

	sameRegion := clubRegion != nil && *clubRegion != ""
	type candidate struct {
		id, poolID string
		division   int
		slot       int
		locality   int
		used       int
		number     int
	}
	var open []candidate
	for _, p := range all {
		if p.division != bottom || p.used >= p.size {
			continue
		}
		locality := 0
		if sameRegion && p.regionID != nil && *p.regionID == *clubRegion {
			locality = 1
		}
		open = append(open, candidate{
			id: p.id, poolID: p.id, division: p.division,
			slot:     lowestFreeSlot(ctx, s, seasonID, p.id, p.size),
			locality: locality, used: p.used, number: p.number,
		})
	}

	if len(open) > 0 {
		sort.SliceStable(open, func(i, j int) bool {
			if open[i].locality != open[j].locality {
				return open[i].locality > open[j].locality
			}
			if open[i].number != open[j].number {
				return open[i].number > open[j].number // weakest band first
			}
			if open[i].used != open[j].used {
				return open[i].used < open[j].used
			}
			return open[i].poolID < open[j].poolID
		})
		best := open[0]
		return JoinResult{Division: best.division, PoolID: &best.poolID, Slot: best.slot}, nil
	}

	// No open slot: describe a new bottom-division pool (division 1 stays one
	// pool and opens D2). Node creates it.
	division := bottom
	if bottom <= 1 {
		division = 2
	}
	return JoinResult{Division: division, Slot: 0, NewPool: true}, nil
}

func lowestFreeSlot(ctx context.Context, s *Service, seasonID, poolID string, size int) int {
	used := map[int]bool{}
	rows, err := s.q.Query(ctx, `SELECT "PoolSlot" FROM "Entries" WHERE "SeasonId" = $1::uuid AND "Group" = $2`, seasonID, poolID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var slot *int
			if err := rows.Scan(&slot); err == nil && slot != nil {
				used[*slot] = true
			}
		}
	}
	for i := 0; i < size; i++ {
		if !used[i] {
			return i
		}
	}
	return size
}
