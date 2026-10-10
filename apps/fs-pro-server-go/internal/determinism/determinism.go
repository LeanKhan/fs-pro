// Package determinism is the game-layer determinism harness (docs/coc-mapping/06
// P0): it runs the pure campus + grid + raid pipeline for a fixed seed and a
// fixed UTC clock and proves the result is byte-identical run to run. It touches
// no database and uses no wall clock or unseeded RNG.
package determinism

import (
	"bytes"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"math"
	"math/rand"
	"time"

	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/league"
	"fs-pro-server/internal/loot"
	"fs-pro-server/internal/matchrating"
)

// Clock is the fixed UTC instant every run uses, so nothing depends on now().
var Clock = time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

// CollectorAccrual is one collector's banked amount at Clock.
type CollectorAccrual struct {
	Key    string  `json:"key"`
	Amount float64 `json:"amount"`
}

// RatingResult is the resolved raid outcome.
type RatingResult struct {
	GoalsFor      int    `json:"goalsFor"`
	GoalsAgainst  int    `json:"goalsAgainst"`
	Stars         int    `json:"stars"`
	Loot          int    `json:"loot"`
	LeagueBonus   int    `json:"leagueBonus"`
	League        string `json:"league"`
	StandingDelta int    `json:"standingDelta"`
}

// Result is the canonical output of one pipeline run, in a fixed field order so
// its JSON encoding is stable.
type Result struct {
	Accrual []CollectorAccrual `json:"accrual"`
	Anchors []grid.Anchor      `json:"anchors"`
	Rating  RatingResult       `json:"rating"`
}

// collectorSpec is a fixed campus configuration (no randomness).
type collectorSpec struct {
	Key      string
	Level    int
	Vault    int
	Tier     int
	HoursAgo int
}

var collectorSpecs = []collectorSpec{
	{Key: "turnstiles", Level: 3, Vault: 2, Tier: 3, HoursAgo: 5},
	{Key: "club_shop", Level: 2, Vault: 2, Tier: 3, HoursAgo: 9},
}

func collectorByKey(key string) (campus.CollectorDef, bool) {
	for _, def := range campus.Collectors {
		if def.Key == key {
			return def, true
		}
	}
	return campus.CollectorDef{}, false
}

// fixedGrid is a legal tier-3 pitch grid (one keeper in X0, no shared cells).
func fixedGrid() grid.Grid {
	return grid.Grid{Slots: []grid.Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: grid.GK},
		{Col: 1, Row: 1, PlayerID: "d1", Position: grid.DEF},
		{Col: 1, Row: 3, PlayerID: "d2", Position: grid.DEF},
		{Col: 1, Row: 5, PlayerID: "d3", Position: grid.DEF},
		{Col: 3, Row: 0, PlayerID: "m1", Position: grid.MID},
		{Col: 3, Row: 2, PlayerID: "m2", Position: grid.MID},
		{Col: 3, Row: 4, PlayerID: "m3", Position: grid.MID},
		{Col: 4, Row: 6, PlayerID: "m4", Position: grid.MID},
		{Col: 6, Row: 1, PlayerID: "a1", Position: grid.ATT},
		{Col: 6, Row: 3, PlayerID: "a2", Position: grid.ATT},
		{Col: 6, Row: 5, PlayerID: "a3", Position: grid.ATT},
	}}
}

// Run executes the pipeline for one seed. It is pure: the only randomness is a
// seeded math/rand, the only clock is Clock, and no map is ranged over where the
// order matters.
func Run(seed int64) Result {
	rng := rand.New(rand.NewSource(seed))

	accrual := make([]CollectorAccrual, 0, len(collectorSpecs))
	for _, spec := range collectorSpecs {
		def, ok := collectorByKey(spec.Key)
		if !ok {
			continue
		}
		cap := campus.CollectorCapacity(def, spec.Level, spec.Vault, spec.Tier)
		since := Clock.Add(-time.Duration(spec.HoursAgo) * time.Hour)
		amount := campus.AccrueScaled(
			campus.Collector{RatePerHour: campus.CollectorRate(def, spec.Level), Capacity: cap},
			since, Clock, 1)
		accrual = append(accrual, CollectorAccrual{Key: spec.Key, Amount: amount})
	}

	anchors := grid.Compile(fixedGrid())

	goalsFor := rng.Intn(6)
	goalsAgainst := rng.Intn(4)
	possFor := 0.30 + rng.Float64()*0.40
	possAgainst := 1 - possFor
	xgFor := 0.4 + rng.Float64()*1.6
	xgAgainst := 0.4 + rng.Float64()*1.6
	dominance := matchrating.Dominance(possFor, possAgainst, xgFor, xgAgainst)
	stars := matchrating.Stars(goalsFor, goalsAgainst, dominance, goalsAgainst == 0)

	unspent := 100000 + rng.Intn(150000)
	lootTaken := loot.RaidLoot(unspent, 2000, 250000)
	lg := league.LeagueFor(2500)
	bonus := loot.LeagueBonus(50000, int(math.Round(lg.Multiplier*100)))
	delta := league.StandingDelta(2500, 2600, stars)

	return Result{
		Accrual: accrual,
		Anchors: anchors,
		Rating: RatingResult{
			GoalsFor:      goalsFor,
			GoalsAgainst:  goalsAgainst,
			Stars:         stars,
			Loot:          lootTaken,
			LeagueBonus:   bonus,
			League:        lg.Name,
			StandingDelta: delta,
		},
	}
}

// Digest returns the canonical JSON of one run and its FNV-1a hash. The hash is
// the stable value a CI job or a golden test can pin.
func Digest(seed int64) (string, []byte, error) {
	b, err := json.Marshal(Run(seed))
	if err != nil {
		return "", nil, err
	}
	h := fnv.New64a()
	_, _ = h.Write(b)
	return fmt.Sprintf("%016x", h.Sum64()), b, nil
}

// Verify runs the pipeline n times for seed and returns an error if any run's
// bytes differ. n < 1 is treated as 1.
func Verify(seed int64, n int) error {
	if n < 1 {
		n = 1
	}
	_, want, err := Digest(seed)
	if err != nil {
		return err
	}
	for i := 1; i < n; i++ {
		_, got, err := Digest(seed)
		if err != nil {
			return err
		}
		if !bytes.Equal(want, got) {
			return fmt.Errorf("determinism: run %d differed for seed %d", i+1, seed)
		}
	}
	return nil
}
