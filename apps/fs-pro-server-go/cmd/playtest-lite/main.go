// Command playtest-lite runs a deterministic, in-process "lite playtest" of the
// Clash-of-Clans-mapped systems: it builds a campus, lays out two pitch grids,
// previews the tactical shapes, resolves a scripted raid into a 0-3 star result,
// and prints the resulting Standing, loot, season and association state.
//
// It needs no database, no network and no Rust engine - it exercises the pure
// cores end to end so the loop can be eyeballed before wiring.
package main

import (
	"fmt"
	"time"

	"fs-pro-server/internal/abilities"
	"fs-pro-server/internal/association"
	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/league"
	"fs-pro-server/internal/legacy"
	"fs-pro-server/internal/loot"
	"fs-pro-server/internal/matchrating"
	"fs-pro-server/internal/scout"
	"fs-pro-server/internal/seasonpass"
)

func attackerGrid() grid.Grid {
	return grid.Grid{Slots: []grid.Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: grid.GK},
		{Col: 1, Row: 1, PlayerID: "d1", Position: grid.DEF},
		{Col: 1, Row: 3, PlayerID: "d2", Position: grid.DEF},
		{Col: 1, Row: 5, PlayerID: "d3", Position: grid.DEF},
		{Col: 3, Row: 0, PlayerID: "m1", Position: grid.MID},
		{Col: 3, Row: 3, PlayerID: "m2", Position: grid.MID},
		{Col: 3, Row: 6, PlayerID: "m3", Position: grid.MID},
		{Col: 4, Row: 5, PlayerID: "m4", Position: grid.MID},
		{Col: 5, Row: 1, PlayerID: "a1", Position: grid.ATT},
		{Col: 6, Row: 3, PlayerID: "a2", Position: grid.ATT},
		{Col: 5, Row: 5, PlayerID: "a3", Position: grid.ATT},
	}}
}

func defenderGrid() grid.Grid {
	return grid.Grid{Slots: []grid.Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: grid.GK},
		{Col: 1, Row: 1, PlayerID: "d1", Position: grid.DEF},
		{Col: 1, Row: 3, PlayerID: "d2", Position: grid.DEF},
		{Col: 1, Row: 5, PlayerID: "d3", Position: grid.DEF},
		{Col: 2, Row: 0, PlayerID: "d4", Position: grid.DEF},
		{Col: 2, Row: 6, PlayerID: "d5", Position: grid.DEF},
		{Col: 3, Row: 2, PlayerID: "m1", Position: grid.MID},
		{Col: 3, Row: 4, PlayerID: "m2", Position: grid.MID},
		{Col: 4, Row: 3, PlayerID: "m3", Position: grid.MID},
		{Col: 4, Row: 1, PlayerID: "m4", Position: grid.MID},
		{Col: 4, Row: 5, PlayerID: "m5", Position: grid.MID},
	}}
}

func derbyWord(r association.Result) string {
	switch r {
	case association.Home:
		return "home association wins"
	case association.Away:
		return "away association wins"
	default:
		return "draw"
	}
}

func line(word string) { fmt.Println(word) }

func main() {
	now := time.Date(2026, time.October, 10, 12, 0, 0, 0, time.UTC) // a Saturday
	line("=== FSPro lite playtest (in-process, deterministic) ===")
	fmt.Printf("session clock: %s\n\n", now.Format(time.RFC3339))

	// [1] Campus economy.
	line("[1] Campus - Lakeside FC")
	tier := 1
	keepers := campus.GroundskeepersForTier(tier)
	fmt.Printf("  Clubhouse tier %d, groundskeepers %d\n", tier, keepers)
	collector := campus.Collector{RatePerHour: loot.Rate(1500, 6, 1000), Capacity: 30000}
	accrued := campus.Accrue(collector, now.Add(-3*time.Hour), now)
	fmt.Printf("  collector %.0f/hr, 3h accrual = %.0f (cap %.0f)\n", collector.RatePerHour, accrued, collector.Capacity)
	fmt.Printf("  can start an upgrade: %v\n\n", campus.CanStartUpgrade(0, keepers))

	// [2] Pitch grids.
	line("[2] Tactics - pitch grids")
	atk, def := attackerGrid(), defenderGrid()
	if reason := grid.Validate(atk, 3); reason != "" {
		fmt.Printf("  attacker grid INVALID: %s\n", reason)
	} else {
		line("  attacker grid valid (tier 3)")
	}
	if reason := grid.Validate(def, 1); reason != "" {
		fmt.Printf("  defender grid INVALID: %s\n", reason)
	} else {
		line("  defender grid valid (tier 1, deep block)")
	}
	preview := grid.BuildPreview(atk)
	fmt.Printf("  attacker preview: directness %.2f, links %d, synergies %v\n", preview.Directness, len(preview.Links), preview.Synergies)
	fmt.Printf("  compiled %d sim slots (keeper x=%.3f)\n", len(grid.SimSlots(atk)), grid.SimSlots(atk)[0].X)
	fmt.Printf("  MID syllabus @ tier 3 / mastery 4: %d abilities\n\n", len(abilities.Eligible(abilities.FamilyMID, 3, 4)))

	// [3] Scouting.
	line("[3] Scout the defender")
	band := scout.Mask(1000, 0)
	fmt.Printf("  masked rating %d..%d (reveals the true 1000: %v)\n\n", band.Low, band.High, scout.Reveals(band, 1000))

	// [4] Raid resolution.
	line("[4] Raid")
	dominance := matchrating.Dominance(62, 38, 2.1, 0.6)
	stars := matchrating.Stars(2, 0, dominance, true)
	fmt.Printf("  attacker wins 2-0, dominance %.2f -> %d stars\n", dominance, stars)
	atkPts, defPts := 1200, 1150
	atkDelta := league.StandingDelta(atkPts, defPts, stars)
	defDelta := league.StandingDelta(defPts, atkPts, 0)
	fmt.Printf("  attacker Standing %d -> %d (%+d)\n", atkPts, atkPts+atkDelta, atkDelta)
	fmt.Printf("  defender Standing %d -> %d (%+d)\n", defPts, defPts+defDelta, defDelta)
	lg := league.LeagueFor(atkPts)
	fmt.Printf("  loot %d, league %s %d (x%.2f), league bonus %d\n", loot.RaidLoot(50000, 2000, 40000), lg.Name, lg.Division, lg.Multiplier, loot.LeagueBonus(100, int(lg.Multiplier*100)))
	fmt.Printf("  Form Bonus ready: %v (%d/5 stars)\n\n", league.FormBonusReady(stars), stars)

	// [5] Season.
	points := 900
	fmt.Printf("[5] Season - %d objective points -> tier %d (next at %d of %d)\n\n", points, seasonpass.TierForPoints(points), seasonpass.NextThreshold(points), seasonpass.MaxTier())

	// [6] Association.
	fmt.Printf("[6] Association - Festival Weekend active: %v\n", association.FestivalActive(now))
	fmt.Printf("  derby stars 10-8 -> %s\n\n", derbyWord(association.DerbyResult(10, 8, 50, 90)))

	// [7] Club Legacy.
	progress := map[string]int{}
	for i := 0; i < 5 && i < len(legacy.Chain); i++ {
		progress[legacy.Chain[i].ID] = legacy.Chain[i].Stars
	}
	fmt.Printf("[7] Legacy - 6th Groundskeeper granted: %d, steps remaining: %d\n", legacy.Granted(progress), len(legacy.Remaining(progress)))

	line("\nLITE PLAYTEST PASSED")
}
