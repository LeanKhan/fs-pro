// Package ranking owns the prominence score and the ordering of clubs for the
// map (D2) and for pyramid seeding. Prominence is defined by
// docs/perfect/WORLD-HIERARCHY-SPEC.md §5 from stored fields only - Division,
// Level (derived from XP), Elo, Fans and Reputation - and cached on
// Clubs.Prominence; the raw fields stay authoritative.
package ranking

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"fs-pro-world-service/internal/db"
)

// Normalisation caps and weights (WORLD-HIERARCHY-SPEC §5.1, DECISIONS Q4 -
// binding). A new club (Elo 1500, Level 0, Fans 150, Rep 5, no division)
// scores ~11.9; a world power scores 100.
const (
	EloMin   = 1200.0
	EloMax   = 2400.0
	LevelCap = 20.0
	FansCap  = 1_000_000.0
	RepCap   = 100.0
	DivMax   = 14.0

	WeightElo   = 0.30
	WeightLevel = 0.25
	WeightFans  = 0.20
	WeightRep   = 0.15
	WeightDiv   = 0.10

	// MaxLevelCap bounds LevelForXP against a pathological thresholds array.
	MaxLevelCap = 10_000
)

// ErrClubNotFound is returned when a club id has no Clubs row.
var ErrClubNotFound = errors.New("ranking: club not found")

// Metrics are the stored club fields the prominence score reads. Level is
// derived from XP, never stored.
type Metrics struct {
	ClubID     string
	Division   int
	XP         int
	Elo        float64
	Fans       int
	Reputation int
}

// Scored is one club's prominence, higher = more prominent.
type Scored struct {
	ClubID string
	Score  float64
}

// Prominence is the cached score plus when it was last written.
type Prominence struct {
	ClubID     string
	Prominence float64
	UpdatedAt  *time.Time
}

// LevelForXP mirrors services/world/level.ts: thresholds[n] is the XP needed
// for Level n (thresholds[0] = 0). Unset/past-the-end levels use 100*n^2.
func LevelForXP(xp int, thresholds []int) int {
	xpFor := func(n int) int {
		if n < 0 {
			n = 0
		}
		if n < len(thresholds) {
			return thresholds[n]
		}
		return 100 * n * n
	}
	value := xp
	if value < 0 {
		value = 0
	}
	level := 0
	for level < MaxLevelCap && xpFor(level+1) <= value {
		level++
	}
	return level
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// Score is the §5.1 formula. Division 0/unknown is treated as DIV_MAX, so a
// club with no pyramid row gets no division bonus.
func Score(m Metrics, thresholds []int) float64 {
	div := m.Division
	if div < 1 {
		div = int(DivMax)
	}

	eloN := clamp01((m.Elo - EloMin) / (EloMax - EloMin))
	lvlN := clamp01(float64(LevelForXP(m.XP, thresholds)) / LevelCap)
	fanN := clamp01(math.Log10(1+float64(m.Fans)) / 6.0)
	repN := clamp01(float64(m.Reputation) / RepCap)
	divN := clamp01(1 - float64(div-1)/DivMax)

	return round2(100 * (WeightElo*eloN + WeightLevel*lvlN + WeightFans*fanN + WeightRep*repN + WeightDiv*divN))
}

// less orders clubs by prominence descending, then §5.2 tie-breaks: Elo, XP,
// Fans, Reputation descending, smaller Division, then ClubId.
func less(a Metrics, ap float64, b Metrics, bp float64) bool {
	if ap != bp {
		return ap > bp
	}
	if a.Elo != b.Elo {
		return a.Elo > b.Elo
	}
	if a.XP != b.XP {
		return a.XP > b.XP
	}
	if a.Fans != b.Fans {
		return a.Fans > b.Fans
	}
	if a.Reputation != b.Reputation {
		return a.Reputation > b.Reputation
	}
	if a.Division != b.Division {
		return a.Division < b.Division
	}
	return a.ClubID < b.ClubID
}

// Rank sorts clubs by the §5.2 order using the default XP curve.
func Rank(ctx context.Context, clubs []Metrics) ([]Scored, error) {
	return RankWithThresholds(ctx, clubs, nil)
}

// RankWithThresholds is Rank with the world's Calendars.LevelThresholds.
func RankWithThresholds(ctx context.Context, clubs []Metrics, thresholds []int) ([]Scored, error) {
	type scored struct {
		m Metrics
		p float64
	}
	xs := make([]scored, len(clubs))
	for i, m := range clubs {
		xs[i] = scored{m: m, p: Score(m, thresholds)}
	}
	slices.SortFunc(xs, func(a, b scored) int {
		switch {
		case less(a.m, a.p, b.m, b.p):
			return -1
		case less(b.m, b.p, a.m, a.p):
			return 1
		}
		return 0
	})
	out := make([]Scored, len(xs))
	for i := range xs {
		out[i] = Scored{ClubID: xs[i].m.ClubID, Score: xs[i].p}
	}
	return out, ctx.Err()
}

// Service computes and reads the cached prominence score.
type Service struct {
	q db.Querier
}

// New returns a DB-backed ranker.
func New(q db.Querier) *Service { return &Service{q: q} }

const metricsSQL = `
SELECT c."_id", c."XP", c."Elo", c."Fans", c."Reputation",
  COALESCE((
    SELECT e."Division" FROM "Entries" e
    JOIN "Seasons" s ON s."_id" = e."SeasonId"
    WHERE e."ClubId" = c."_id" AND e."Division" IS NOT NULL
    ORDER BY (s."Status" = 'running') DESC, s."EditionNumber" DESC NULLS LAST
    LIMIT 1
  ), 14) AS div
FROM "Clubs" c
WHERE c."_id" = ANY($1::uuid[])`

// metricsFor loads the score inputs for the given clubs.
func (s *Service) metricsFor(ctx context.Context, clubIDs []string) ([]Metrics, error) {
	rows, err := s.q.Query(ctx, metricsSQL, clubIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Metrics
	for rows.Next() {
		var m Metrics
		if err := rows.Scan(&m.ClubID, &m.XP, &m.Elo, &m.Fans, &m.Reputation, &m.Division); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// thresholds reads Calendars.LevelThresholds once; nil means the default curve.
func (s *Service) thresholds(ctx context.Context) ([]int, error) {
	var raw *string
	if err := s.q.QueryRow(ctx, `SELECT "LevelThresholds"::text FROM "Calendars" LIMIT 1`).Scan(&raw); err != nil {
		// A missing calendar must not fail a recompute; fall back to the curve.
		return nil, nil
	}
	if raw == nil || *raw == "" || *raw == "null" {
		return nil, nil
	}
	var values []int
	if err := json.Unmarshal([]byte(*raw), &values); err != nil {
		return nil, nil
	}
	return values, nil
}

// Get returns one club's cached prominence.
func (s *Service) Get(ctx context.Context, clubID string) (Prominence, error) {
	var (
		p  float64
		ts pgtype.Timestamptz
	)
	err := s.q.QueryRow(ctx, `SELECT "Prominence", "ProminenceUpdatedAt" FROM "Clubs" WHERE "_id" = $1::uuid`, clubID).Scan(&p, &ts)
	if errors.Is(err, pgx.ErrNoRows) {
		return Prominence{}, ErrClubNotFound
	}
	if err != nil {
		return Prominence{}, err
	}
	out := Prominence{ClubID: clubID, Prominence: round2(p)}
	if ts.Valid {
		t := ts.Time
		out.UpdatedAt = &t
	}
	return out, nil
}

// Recompute recomputes and caches prominence for a batch of clubs, in one
// set-based UPDATE. It returns the number of rows written.
func (s *Service) Recompute(ctx context.Context, clubIDs []string) (int, error) {
	if len(clubIDs) == 0 {
		return 0, nil
	}
	thresholds, err := s.thresholds(ctx)
	if err != nil {
		return 0, err
	}
	metrics, err := s.metricsFor(ctx, clubIDs)
	if err != nil {
		return 0, err
	}
	if len(metrics) == 0 {
		return 0, nil
	}

	ids := make([]string, len(metrics))
	scores := make([]float64, len(metrics))
	for i, m := range metrics {
		ids[i] = m.ClubID
		scores[i] = Score(m, thresholds)
	}

	tag, err := s.q.Exec(ctx, `
UPDATE "Clubs" c
SET "Prominence" = v.p, "ProminenceUpdatedAt" = now()
FROM unnest($1::uuid[], $2::real[]) AS v(id, p)
WHERE c."_id" = v.id`, ids, scores)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}
