// Command playtest-lite runs a deterministic, in-process "lite playtest" of the
// Clash-of-Clans-mapped systems: it builds a campus, lays out two pitch grids,
// previews the tactical shapes, resolves a scripted raid into a 0-3 star result,
// and prints the resulting Standing, loot, season and association state.
//
// It needs no database, no network and no Rust engine - it exercises the pure
// cores end to end so the loop can be eyeballed before wiring.
//
// It is an *asserting* playtest, not a print-only demo: every key outcome
// (accrual clamp, grid validation, star rating, Standing/loot delta, season
// tier, Festival window, legacy progress) is checked, and the process exits
// non-zero with a report on stderr if any check fails. It is fully
// deterministic - the clock is a fixed UTC instant and no random source is used.
package main

import (
	"fmt"
	"os"
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

// failures counts failed assertions so main can exit non-zero.
var failures int

// check asserts cond, reporting a failure on stderr (never panicking mid-session
// so every phase is exercised and all failures are surfaced together).
func check(cond bool, format string, args ...any) {
	if cond {
		return
	}
	failures++
	fmt.Fprintf(os.Stderr, "ASSERT FAILED: "+format+"\n", args...)
}

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
	check(keepers == 1, "tier %d must grant 1 groundskeeper, got %d", tier, keepers)
	check(campus.MaxGroundskeepers == 6,
		"the 6th Groundskeeper is the Club Legacy cap; MaxGroundskeepers = %d", campus.MaxGroundskeepers)

	collector := campus.Collector{RatePerHour: loot.Rate(1500, 6, 1000), Capacity: 30000}
	accrued := campus.Accrue(collector, now.Add(-3*time.Hour), now)
	fmt.Printf("  collector %.0f/hr, 3h accrual = %.0f (cap %.0f)\n", collector.RatePerHour, accrued, collector.Capacity)
	check(accrued == 22500, "3h accrual = %.0f, want 22500", accrued)

	// The clamp is the load-bearing part: overnight accrual (and any elapsed
	// duration) must never exceed capacity, and a non-positive span is zero.
	capped := campus.Accrue(collector, now.Add(-10*time.Hour), now)
	fmt.Printf("  collector clamped after 10h = %.0f\n", capped)
	check(capped == collector.Capacity, "10h accrual must clamp to %.0f, got %.0f", collector.Capacity, capped)
	check(campus.Accrue(collector, now, now.Add(-time.Hour)) == 0,
		"a non-positive elapsed span must accrue nothing")

	canStart := campus.CanStartUpgrade(0, keepers)
	fmt.Printf("  can start an upgrade: %v\n\n", canStart)
	check(canStart, "an idle club with %d groundskeeper must be able to start an upgrade", keepers)
	check(!campus.CanStartUpgrade(keepers, keepers),
		"a club with all groundskeepers busy must not start another upgrade")

	// [2] Pitch grids.
	line("[2] Tactics - pitch grids")
	atk, def := attackerGrid(), defenderGrid()
	if reason := grid.Validate(atk, 3); reason != "" {
		fmt.Printf("  attacker grid INVALID: %s\n", reason)
	} else {
		line("  attacker grid valid (tier 3)")
	}
	check(grid.Validate(atk, 3) == "", "attacker grid must validate at tier 3: %s", grid.Validate(atk, 3))
	if reason := grid.Validate(def, 1); reason != "" {
		fmt.Printf("  defender grid INVALID: %s\n", reason)
	} else {
		line("  defender grid valid (tier 1, deep block)")
	}
	check(grid.Validate(def, 1) == "", "defender grid must validate at tier 1: %s", grid.Validate(def, 1))
	// The Clubhouse tier is a real gate: the same attacking shape is illegal at
	// tier 1 (columns beyond X4 are locked, 03 §1.3).
	check(grid.Validate(atk, 1) != "",
		"the attacker shape (columns up to X6) must be rejected at tier 1")

	preview := grid.BuildPreview(atk)
	simSlots := grid.SimSlots(atk)
	fmt.Printf("  attacker preview: directness %.2f, links %d, synergies %v\n", preview.Directness, len(preview.Links), preview.Synergies)
	fmt.Printf("  compiled %d sim slots (keeper x=%.3f)\n", len(simSlots), simSlots[0].X)
	check(len(simSlots) == grid.Starters, "compiled %d sim slots, want %d", len(simSlots), grid.Starters)

	midAbilities := abilities.Eligible(abilities.FamilyMID, 3, 4)
	fmt.Printf("  MID syllabus @ tier 3 / mastery 4: %d abilities\n\n", len(midAbilities))
	check(len(midAbilities) > 0, "a tier-3/mastery-4 MID player must have a syllabus")

	// [3] Scouting.
	line("[3] Scout the defender")
	band := scout.Mask(1000, 0)
	fmt.Printf("  masked rating %d..%d (reveals the true 1000: %v)\n\n", band.Low, band.High, scout.Reveals(band, 1000))
	check(band == scout.Band{Low: 985, High: 1015}, "level-0 mask = %+v, want {985,1015}", band)
	check(scout.Reveals(band, 1000), "a scout band must contain the true rating")
	// Even a maxed scouting facility must never leak the exact rating.
	deep := scout.Mask(1000, 6)
	check(deep.High-deep.Low >= 6, "a deep report must still be a band, got %+v", deep)
	check(!scout.Reveals(deep, 1000+4), "a deep report must not leak the exact rating: %+v", deep)
	check(!scout.Reveals(band, 900), "a band must not contain a rating outside it")

	// [4] Raid resolution.
	line("[4] Raid")
	dominance := matchrating.Dominance(62, 38, 2.1, 0.6)
	stars := matchrating.Stars(2, 0, dominance, true)
	fmt.Printf("  attacker wins 2-0, dominance %.2f -> %d stars\n", dominance, stars)
	check(stars == 3, "a 2-0 win with dominance %.2f and a clean sheet must rate 3 stars, got %d", dominance, stars)

	atkPts, defPts := 1200, 1150
	atkDelta := league.StandingDelta(atkPts, defPts, stars)
	defDelta := league.StandingDelta(defPts, atkPts, 0)
	fmt.Printf("  attacker Standing %d -> %d (%+d)\n", atkPts, atkPts+atkDelta, atkDelta)
	fmt.Printf("  defender Standing %d -> %d (%+d)\n", defPts, defPts+defDelta, defDelta)
	check(atkDelta > 0, "a winning attacker must gain Standing, got %+d", atkDelta)
	check(atkDelta == 31, "even-ish 3-star win = %+d, want +31", atkDelta)
	check(defDelta < 0, "a losing defender must lose Standing, got %+d", defDelta)
	check(defDelta == -29, "defeat to a stronger club = %+d, want -29", defDelta)

	lg := league.LeagueFor(atkPts)
	raidLoot := loot.RaidLoot(50000, 2000, 40000)
	leagueBonus := loot.LeagueBonus(100, int(lg.Multiplier*100))
	fmt.Printf("  loot %d, league %s %d (x%.2f), league bonus %d\n", raidLoot, lg.Name, lg.Division, lg.Multiplier, leagueBonus)
	check(lg.Name == "Gold" && lg.Division == 3, "1200 Standing must be Gold 3, got %s %d", lg.Name, lg.Division)
	check(raidLoot == 10000, "raid loot = %d, want 10000", raidLoot)
	check(leagueBonus == 130, "league bonus = %d, want 130 (x1.30)", leagueBonus)

	// Form Bonus is a *cumulative* 5-star threshold, not one match's rating.
	fmt.Printf("  Form Bonus ready: %v (%d/5 cumulative stars)\n\n", league.FormBonusReady(stars), stars)
	check(!league.FormBonusReady(stars), "a single 3-star raid cannot earn the Form Bonus")
	check(league.FormBonusReady(5), "5 cumulative stars must earn the Form Bonus")

	// [5] Season.
	points := 900
	fmt.Printf("[5] Season - %d objective points -> tier %d (next at %d of %d)\n\n", points, seasonpass.TierForPoints(points), seasonpass.NextThreshold(points), seasonpass.MaxTier())
	check(seasonpass.TierForPoints(points) == 4, "900 points must be season tier 4, got %d", seasonpass.TierForPoints(points))
	check(seasonpass.NextThreshold(points) == 1200, "next season tier at 900 points is 1200, got %d", seasonpass.NextThreshold(points))
	// The Gold track is pass-only; Silver is free (04 §6).
	check(!seasonpass.CanClaim(seasonpass.Gold, false, 4, 0), "the Gold track must require the Season Pass")
	check(seasonpass.CanClaim(seasonpass.Gold, true, 4, 0), "the Gold track is claimable with the pass")
	check(seasonpass.CanClaim(seasonpass.Silver, false, 4, 0), "the Silver track is free for all")
	check(!seasonpass.CanClaim(seasonpass.Track("platinum"), false, 4, 0), "an unknown track must not be claimable")

	// [6] Association.
	fmt.Printf("[6] Association - Festival Weekend active: %v\n", association.FestivalActive(now))
	fmt.Printf("  derby stars 10-8 -> %s\n\n", derbyWord(association.DerbyResult(10, 8, 50, 90)))
	check(association.MaxMembers == 50, "the Association cap = %d, want 50", association.MaxMembers)
	check(association.FestivalActive(now), "the Festival Weekend must be open on a Saturday")
	check(association.FestivalActive(time.Date(2026, time.October, 9, 7, 0, 0, 0, time.UTC)),
		"the Festival Weekend opens Fri 07:00 UTC (inclusive)")
	check(!association.FestivalActive(time.Date(2026, time.October, 12, 7, 0, 0, 0, time.UTC)),
		"the Festival Weekend closes Mon 07:00 UTC (exclusive)")
	check(association.DerbyResult(10, 8, 50, 90) == association.Home, "more stars must win the Derby")
	check(association.DerbyResult(10, 10, 55, 60) == association.Away, "equal stars break on destruction")
	check(association.DerbyResult(10, 10, 60, 60) == association.Draw, "a total tie is a draw")

	// [7] Club Legacy.
	progress := map[string]int{}
	for i := 0; i < 5 && i < len(legacy.Chain); i++ {
		progress[legacy.Chain[i].ID] = legacy.Chain[i].Stars
	}
	remaining := legacy.Remaining(progress)
	fmt.Printf("[7] Legacy - 6th Groundskeeper granted: %d, steps remaining: %d\n", legacy.Granted(progress), len(remaining))
	check(legacy.Granted(progress) == 0, "an incomplete chain must not grant the 6th Groundskeeper")
	check(len(remaining) == len(legacy.Chain)-5, "5 met steps leave %d remaining, got %d", len(legacy.Chain)-5, len(remaining))

	full := map[string]int{}
	for _, s := range legacy.Chain {
		full[s.ID] = s.Stars
	}
	check(legacy.Granted(full) == 1, "a complete chain must grant the 6th Groundskeeper")
	check(legacy.TotalStars(full) == legacy.MaxStars(),
		"a complete chain must bank MaxStars %d, got %d", legacy.MaxStars(), legacy.TotalStars(full))

	if failures > 0 {
		fmt.Fprintf(os.Stderr, "\nLITE PLAYTEST FAILED: %d assertion(s)\n", failures)
		os.Exit(1)
	}
	line("\nLITE PLAYTEST PASSED")
}
