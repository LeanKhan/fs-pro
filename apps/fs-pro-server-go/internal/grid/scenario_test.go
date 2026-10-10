package grid

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
)

// The P3 exit criterion (docs/coc-mapping/06 P3, 03 Part 4): contrasting pitch
// grids compiled in Go must produce *plausible* results through the real engine
// - no shape winning ~100% of matches. The matches carry no orders/effects, so
// the additive sim-core work (07, P4) cannot change them (empty-effects parity).
//
// Binary resolution: SIM_CLI wins when set (a missing file is a hard failure);
// otherwise the cargo build output is searched under crates/sim-core/target. If
// neither exists the test SKIPS with a clear message - it never silently passes.
// Run it explicitly with, e.g.:
//   SIM_CLI=crates/sim-core/target/debug/sim_cli.exe go test ./internal/grid -run Scenario
//
// All matches use fixed seeded fixtures, so a given binary reproduces exactly.

type simPlayer struct {
	ID       string  `json:"id"`
	Position string  `json:"position"`
	Rating   float64 `json:"Rating"`
}

type simClub struct {
	ID      string      `json:"_id"`
	Name    string      `json:"Name"`
	Code    string      `json:"ClubCode"`
	Players []simPlayer `json:"Players"`
}

type simTactic struct {
	Formation string    `json:"formationName"`
	Style     string    `json:"styleName"`
	Slots     []SimSlot `json:"slots"`
}

type simRequest struct {
	FixtureID     string     `json:"fixtureId"`
	Seed          string     `json:"seed"`
	IncludeFrames bool       `json:"includeFrames"`
	Sides         simSides   `json:"sides"`
	Clubs         []simClub  `json:"clubs"`
	Tactics       simTactics `json:"tactics"`
}

type simSides struct {
	Home string `json:"home"`
	Away string `json:"away"`
}

type simTactics struct {
	Home simTactic `json:"home"`
	Away simTactic `json:"away"`
}

type simResponse struct {
	OK    bool   `json:"ok"`
	Error string `json:"error"`
	Match struct {
		Details struct {
			HomeTeamScore int `json:"HomeTeamScore"`
			AwayTeamScore int `json:"AwayTeamScore"`
		} `json:"Details"`
	} `json:"match"`
}

// scenario is one shape-A-vs-shape-B experiment. Each grid is paired with the
// style that shape represents (a deep block is not a coherent tactic with a
// Balanced style), because the compiled grid supplies the anchors while the
// manager's style is the other half of the engine's tactic input.
type scenario struct {
	name           string
	a, b           Grid
	aStyle, bStyle string
	// minA/maxA bound shape A's overall win rate (home advantage removed by
	// playing A both home and away); maxB bounds shape B so neither shape can
	// dominate. Bands are set from the measured engine behaviour with headroom.
	minA float64
	maxA float64
	maxB float64
}

// simCLIPath resolves the engine binary. SIM_CLI (if set) must exist.
func simCLIPath(t *testing.T) string {
	t.Helper()
	if p := strings.TrimSpace(os.Getenv("SIM_CLI")); p != "" {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("SIM_CLI=%q does not exist: %v", p, err)
		}
		return p
	}
	_, thisFile, _, _ := runtime.Caller(0)
	// .../apps/fs-pro-server-go/internal/grid/scenario_test.go -> repo root
	root := filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "..", "..", ".."))
	names := []string{"sim_cli"}
	if runtime.GOOS == "windows" {
		// Windows builds are `sim_cli.exe`; on other platforms only the native
		// name is valid (a Windows .exe cannot be exec'd in a Linux container).
		names = append(names, "sim_cli.exe")
	}
	dirs := []string{
		filepath.Join(root, "crates", "sim-core", "target", "debug"),
		filepath.Join(root, "crates", "sim-core", "target", "debug", "deps"),
		filepath.Join(root, "crates", "sim-core", "target", "release"),
	}
	for _, d := range dirs {
		for _, n := range names {
			p := filepath.Join(d, n)
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	t.Skipf("sim_cli not found (searched under %s); build it with `cargo build --bin sim_cli` or set SIM_CLI", filepath.Join(root, "crates", "sim-core", "target"))
	return ""
}

// squad builds an identical 15-player squad for a side (5 DEF / 5 MID / 4 ATT,
// one keeper), all rated 70, so a result difference is the shape, not talent.
func squad(prefix string) []simPlayer {
	pos := []string{"DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "ATT", "ATT", "ATT", "ATT"}
	out := []simPlayer{{ID: prefix + "gk", Position: "GK", Rating: 70}}
	for i, p := range pos {
		out = append(out, simPlayer{ID: fmt.Sprintf("%s%02d", prefix, i+1), Position: p, Rating: 70})
	}
	return out
}

func scenarioRequest(sc scenario, seed int, aHome bool) simRequest {
	home, away := sc.a, sc.b
	homeStyle, awayStyle := sc.aStyle, sc.bStyle
	if !aHome {
		home, away = sc.b, sc.a
		homeStyle, awayStyle = sc.bStyle, sc.aStyle
	}
	return simRequest{
		FixtureID:     fmt.Sprintf("scn-%s-%d", sc.name, seed),
		Seed:          fmt.Sprintf("scn:%s:%d", sc.name, seed),
		IncludeFrames: false,
		Sides:         simSides{Home: "H", Away: "A"},
		Clubs: []simClub{
			{ID: "H", Name: "Home", Code: "HOM", Players: squad("h")},
			{ID: "A", Name: "Away", Code: "AWY", Players: squad("a")},
		},
		Tactics: simTactics{
			Home: simTactic{Formation: "433", Style: homeStyle, Slots: SimSlots(home)},
			Away: simTactic{Formation: "433", Style: awayStyle, Slots: SimSlots(away)},
		},
	}
}

func execMatch(exe string, req simRequest) (int, int, error) {
	raw, err := json.Marshal(req)
	if err != nil {
		return 0, 0, err
	}
	cmd := exec.Command(exe, "-")
	cmd.Stdin = bytes.NewReader(raw)
	var out, errbuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errbuf
	if err := cmd.Run(); err != nil {
		return 0, 0, fmt.Errorf("sim_cli: %v: %s", err, errbuf.String())
	}
	var resp simResponse
	if err := json.Unmarshal(out.Bytes(), &resp); err != nil {
		return 0, 0, fmt.Errorf("decode sim_cli output: %w", err)
	}
	if !resp.OK {
		return 0, 0, fmt.Errorf("sim_cli error: %s", resp.Error)
	}
	return resp.Match.Details.HomeTeamScore, resp.Match.Details.AwayTeamScore, nil
}

// runBatch executes every request on a worker pool (process spawn dominates).
func runBatch(t *testing.T, exe string, reqs []simRequest) [][2]int {
	t.Helper()
	scores := make([][2]int, len(reqs))
	errs := make([]error, len(reqs))
	workers := runtime.NumCPU()
	if workers < 1 {
		workers = 1
	}
	jobs := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				h, a, err := execMatch(exe, reqs[i])
				if err != nil {
					errs[i] = err
					continue
				}
				scores[i] = [2]int{h, a}
			}
		}()
	}
	for i := range reqs {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("match %d: %v", i, err)
		}
	}
	return scores
}

// outcome is shape A's aggregate over both home/away configurations.
type outcome struct {
	aWins, bWins, draws int
}

func (o outcome) aRate() float64 { return float64(o.aWins) / float64(o.aWins+o.bWins+o.draws) }
func (o outcome) bRate() float64 { return float64(o.bWins) / float64(o.aWins+o.bWins+o.draws) }
func (o outcome) dRate() float64 { return float64(o.draws) / float64(o.aWins+o.bWins+o.draws) }

func TestScenarioWinRateBands(t *testing.T) {
	exe := simCLIPath(t)

	const seedsPerSide = 60
	scenarios := buildScenarios()

	for _, sc := range scenarios {
		if reason := Validate(sc.a, 5); reason != "" {
			t.Fatalf("%s: shape A illegal: %s", sc.name, reason)
		}
		if reason := Validate(sc.b, 5); reason != "" {
			t.Fatalf("%s: shape B illegal: %s", sc.name, reason)
		}
		reqs := make([]simRequest, 0, seedsPerSide*2)
		aHome := make([]bool, 0, seedsPerSide*2)
		for i := 0; i < seedsPerSide; i++ {
			reqs = append(reqs, scenarioRequest(sc, i, true))
			aHome = append(aHome, true)
			reqs = append(reqs, scenarioRequest(sc, i, false))
			aHome = append(aHome, false)
		}
		scores := runBatch(t, exe, reqs)

		var o outcome
		for i, s := range scores {
			homeGoals, awayGoals := s[0], s[1]
			aGoals, bGoals := homeGoals, awayGoals
			if !aHome[i] {
				aGoals, bGoals = awayGoals, homeGoals
			}
			switch {
			case aGoals > bGoals:
				o.aWins++
			case aGoals < bGoals:
				o.bWins++
			default:
				o.draws++
			}
		}
		t.Logf("%-24s n=%d  A wins %.3f | B wins %.3f | draws %.3f", sc.name, len(scores), o.aRate(), o.bRate(), o.dRate())

		// The headline criterion: no shape may win ~100% of matches.
		if worst := maxFloat(o.aRate(), o.bRate()); worst >= 0.75 {
			t.Errorf("%s: a shape wins %.3f of matches, want < 0.75 (degenerate shape)", sc.name, worst)
		}
		if o.bRate() > sc.maxB {
			t.Errorf("%s: shape B wins %.3f, want <= %.2f", sc.name, o.bRate(), sc.maxB)
		}
		if o.aRate() < sc.minA || o.aRate() > sc.maxA {
			t.Errorf("%s: shape A wins %.3f, want within [%.2f, %.2f]", sc.name, o.aRate(), sc.minA, sc.maxA)
		}
		// Matches must be decided by the shapes, not a degenerate all-draws
		// standoff (which would mean the compiled anchors barely matter).
		if o.aRate()+o.bRate() < 0.10 {
			t.Errorf("%s: only %.3f of matches were decided, want >= 0.10", sc.name, o.aRate()+o.bRate())
		}
	}
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// buildScenarios defines the three P3 shapes (docs/coc-mapping/06 P3). Bands are
// the measured engine behaviour (see PROGRESS.md) with headroom; the styles are
// the ones each shape implies (a bunker counters with Direct; a rush presses).
func buildScenarios() []scenario {
	return []scenario{
		{name: "bunker-vs-rush", a: bunker(), b: rush(), aStyle: "Direct", bStyle: "HighPress", minA: 0.10, maxA: 0.45, maxB: 0.42},
		{name: "overload-vs-lowblock", a: overload(), b: lowBlock(), aStyle: "Balanced", bStyle: "Balanced", minA: 0.12, maxA: 0.50, maxB: 0.42},
		{name: "lone-striker", a: loneStriker(), b: balanced(), aStyle: "Direct", bStyle: "Balanced", minA: 0.02, maxA: 0.30, maxB: 0.45},
	}
}

// makeGrid builds a legal 9x7 grid from (col,row,position) triples with
// generated player ids.
func makeGrid(cells []cell) Grid {
	g := Grid{Slots: make([]Slot, 0, len(cells))}
	for i, c := range cells {
		g.Slots = append(g.Slots, Slot{Col: c.col, Row: c.row, PlayerID: fmt.Sprintf("p%02d", i), Position: c.pos})
	}
	return g
}

type cell struct {
	col, row int
	pos      Position
}

// bunker: an ultra-deep, compact low block with one isolated outlet.
func bunker() Grid {
	return makeGrid([]cell{
		{0, 3, GK},
		{1, 2, DEF}, {1, 3, DEF}, {1, 4, DEF}, {2, 3, DEF},
		{2, 1, MID}, {2, 5, MID}, {3, 2, MID}, {3, 3, MID}, {3, 4, MID},
		{5, 3, ATT},
	})
}

// rush: a high press, the whole block pushed into the opponent's half.
func rush() Grid {
	return makeGrid([]cell{
		{0, 3, GK},
		{3, 2, DEF}, {3, 3, DEF}, {3, 4, DEF},
		{4, 1, MID}, {4, 3, MID}, {4, 5, MID}, {5, 2, MID}, {5, 4, MID},
		{6, 3, ATT}, {7, 3, ATT},
	})
}

// overload: an all-in right-flank attack.
func overload() Grid {
	return makeGrid([]cell{
		{0, 3, GK},
		{1, 3, DEF}, {2, 3, DEF}, {2, 5, DEF},
		{4, 3, MID}, {4, 6, MID}, {5, 5, MID}, {5, 6, MID},
		{6, 5, ATT}, {6, 6, ATT}, {7, 6, ATT},
	})
}

// lowBlock: a connected, deep central block with one outlet.
func lowBlock() Grid {
	return makeGrid([]cell{
		{0, 3, GK},
		{1, 2, DEF}, {1, 3, DEF}, {1, 4, DEF}, {2, 3, DEF},
		{2, 1, MID}, {2, 5, MID}, {3, 2, MID}, {3, 3, MID}, {3, 4, MID},
		{5, 2, ATT},
	})
}

// loneStriker: a marooned target man, no connector in the final third.
func loneStriker() Grid {
	return makeGrid([]cell{
		{0, 3, GK},
		{1, 2, DEF}, {1, 3, DEF}, {1, 4, DEF}, {1, 5, DEF},
		{2, 2, MID}, {2, 3, MID}, {2, 4, MID}, {3, 2, MID}, {3, 4, MID},
		{8, 3, ATT},
	})
}

// balanced: a conventional 4-3-3 baseline.
func balanced() Grid {
	return makeGrid([]cell{
		{0, 3, GK},
		{1, 1, DEF}, {1, 3, DEF}, {1, 5, DEF}, {2, 4, DEF},
		{3, 2, MID}, {3, 3, MID}, {3, 4, MID},
		{5, 1, ATT}, {5, 3, ATT}, {5, 5, ATT},
	})
}

// TestScenarioShapesAreLegal is a fast guard so a scenario edit cannot ship an
// illegal grid (GK zone, occupancy, tier gate) unnoticed.
func TestScenarioShapesAreLegal(t *testing.T) {
	for _, sc := range buildScenarios() {
		if reason := Validate(sc.a, 5); reason != "" {
			t.Errorf("%s A: %s", sc.name, reason)
		}
		if reason := Validate(sc.b, 5); reason != "" {
			t.Errorf("%s B: %s", sc.name, reason)
		}
	}
	names := []string{}
	for _, sc := range buildScenarios() {
		names = append(names, sc.name)
	}
	sort.Strings(names)
	if len(names) != 3 {
		t.Fatalf("want 3 scenarios, got %v", names)
	}
}
