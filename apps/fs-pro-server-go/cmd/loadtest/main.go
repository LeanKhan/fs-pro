// Command loadtest is the P10 defense load test for the FSPro Clash-of-Clans
// mapping (docs/coc-mapping/06-ROADMAP.md, "Load tests for concurrent defenses
// / worker throughput"; 05 §7 "Batch defense resolution").
//
// It clones a throwaway scratch database from the migration chain (never the
// dev/scratch DB itself), seeds many attacker and defender clubs with squads
// and stored Home/Match grids, queues N raids durably, then drains them through
// the *real* worker path (play.ResolvePendingRaids, the same function the
// world-worker "defenses" ticker runs) with several parallel workers - each in
// its own transaction, using the production FOR UPDATE SKIP LOCKED claim. It
// measures matches/second and asserts:
//
//  1. every raid resolved exactly once (RaidResults PK = one row per raid);
//  2. no double-apply - the attacker/defender Standing deltas recorded in
//     RaidResults sum to the actual Clubs.StandingPoints movement, and the
//     raid loot ledger row count matches the results;
//  3. the second sweep resolves nothing (the idempotency guard);
//  4. no data races - run under `go run -race` (see the command in the report).
//
// The simulation is the real sim-service when one is reachable; otherwise a
// deterministic in-process fake is used and reported (never silent). The
// DB/worker/economy path is identical either way. Use -keep to inspect the
// scratch DB; by default it is dropped.
//
// Clubs default to one per raid. With fewer clubs than raids, several live
// worker batches lock the same club rows in different orders and Postgres
// reports a lock-order-inversion deadlock, which play.ResolvePendingRaids then
// records as a permanently 'failed' raid (the per-batch transaction accumulates
// club locks until it commits; see the P10 finding in the report). Passing
// small -attackers/-defenders reproduces that; the default avoids it.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"hash/fnv"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/play"
)

const (
	defaultDatabaseURL = "postgresql://fspro:superpassword@localhost:5434/fspro_scratch"
	defaultTargetDB    = "fspro_loadtest"

	// playerPositions is the canonical 11-player shape a legal squad needs.
	playerPositions = "GK,DEF,DEF,DEF,DEF,MID,MID,MID,MID,ATT,ATT"

	// raidSeed is the Standing every seeded club starts on (Silver I), so a
	// raid's Standing delta is unambiguous.
	raidSeed = 1000
)

type config struct {
	target    string
	source    string
	raids     int
	attackers int
	defenders int
	workers   int
	batch     int
	simMode   string
	keep      bool
}

func main() {
	cfg := config{}
	flag.StringVar(&cfg.target, "db", defaultTargetDB, "throwaway database to create and drop")
	flag.StringVar(&cfg.source, "source", "", "template database (default: the database in DATABASE_URL)")
	flag.IntVar(&cfg.raids, "raids", 500, "number of concurrent raids to queue and resolve")
	flag.IntVar(&cfg.attackers, "attackers", 0, "attacker clubs (0 = one per raid, so no two live batches share a club)")
	flag.IntVar(&cfg.defenders, "defenders", 0, "defender clubs (0 = one per raid)")
	flag.IntVar(&cfg.workers, "workers", 0, "parallel worker transactions (default: NumCPU)")
	flag.IntVar(&cfg.batch, "batch", play.DefaultDefenseBatch, "raids claimed per ResolvePendingRaids call")
	flag.StringVar(&cfg.simMode, "sim", "auto", "simulator: auto|real|fake")
	flag.BoolVar(&cfg.keep, "keep", false, "keep the throwaway database (do not drop it)")
	flag.Parse()
	if cfg.workers <= 0 {
		cfg.workers = runtime.NumCPU()
	}
	// One club per raid by default: two workers' batches then share no club row,
	// so the worker's per-batch lock accumulation cannot invert lock order. Pass
	// small -attackers/-defenders to reproduce the contended case (see README).
	if cfg.attackers <= 0 {
		cfg.attackers = cfg.raids
	}
	if cfg.defenders <= 0 {
		cfg.defenders = cfg.raids
	}
	if cfg.raids <= 0 {
		fmt.Fprintln(os.Stderr, "loadtest: -raids must be positive")
		os.Exit(2)
	}
	if err := run(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "\n========== LOAD TEST FAILURE ==========\n%v\n", err)
		os.Exit(1)
	}
}

type loadtest struct {
	cfg       config
	pool      *db.Pool
	admin     *db.Pool
	sim       play.Simulator
	simLabel  string
	attackers []string
	defenders []string
}

func run(cfg config) error {
	ctx := context.Background()

	admin, dsn, err := openAdmin(ctx)
	if err != nil {
		return err
	}
	defer admin.Close()

	source := cfg.source
	if source == "" {
		source = databaseName(dsn)
	}
	if source == "" {
		return errors.New("could not determine the template database from DATABASE_URL")
	}
	if cfg.target == source {
		return fmt.Errorf("refusing to run against the template database %q", source)
	}
	if err := ensureDatabase(ctx, admin, cfg.target, source); err != nil {
		return err
	}
	pool, err := db.New(ctx, replaceDatabase(dsn, cfg.target), 120*time.Second, nil)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("scratch database not reachable: %w", err)
	}

	l := &loadtest{cfg: cfg, pool: pool, admin: admin}

	fmt.Printf("FSPro defense load test\n")
	fmt.Printf("  template : %s\n", source)
	fmt.Printf("  scratch  : %s (created fresh%s)\n", cfg.target, map[bool]string{true: ", kept", false: ", dropped on exit"}[cfg.keep])
	fmt.Printf("  raids    : %d across %d attackers / %d defenders\n", cfg.raids, cfg.attackers, cfg.defenders)
	fmt.Printf("  workers  : %d (batch %d)\n", cfg.workers, cfg.batch)

	l.sim, l.simLabel = chooseSimulator(ctx, cfg.simMode)
	fmt.Printf("  sim      : %s\n", l.simLabel)

	err = l.execute(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\nASSERT FAILED: %v\n", err)
	}

	if !cfg.keep {
		if dropErr := dropDatabase(ctx, admin, cfg.target); dropErr != nil {
			return fmt.Errorf("run finished but dropping %q failed: %w", cfg.target, dropErr)
		}
		fmt.Printf("\n  scratch database %q dropped\n", cfg.target)
	}
	return err
}

func (l *loadtest) execute(ctx context.Context) error {
	if err := l.seedWorld(ctx); err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	if err := l.queueRaids(ctx); err != nil {
		return fmt.Errorf("queue: %w", err)
	}

	resolved, elapsed, err := l.drain(ctx)
	if err != nil {
		return fmt.Errorf("drain: %w", err)
	}
	rate := float64(l.cfg.raids) / elapsed.Seconds()
	fmt.Printf("\nRESULT\n")
	fmt.Printf("  resolved : %d / %d raids in %s\n", resolved, l.cfg.raids, elapsed.Round(time.Millisecond))
	fmt.Printf("  throughput : %.0f matches/sec (%.0f per core, %d cores)\n", rate, rate/float64(runtime.NumCPU()), runtime.NumCPU())
	if err := l.printStatus(ctx); err != nil {
		return err
	}

	if err := l.verify(ctx, resolved); err != nil {
		return err
	}

	// Idempotency: a second sweep must resolve nothing and change no state.
	again, err := drainOnce(ctx, l.pool, l.sim, l.cfg.batch, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("second sweep: %w", err)
	}
	if again != 0 {
		return fmt.Errorf("second sweep resolved %d raids, want 0", again)
	}
	guards, err := l.scalarInt(ctx, `SELECT count(*)::int FROM "RaidResults"`)
	if err != nil {
		return err
	}
	if guards != l.cfg.raids {
		return fmt.Errorf("after replay RaidResults = %d, want %d", guards, l.cfg.raids)
	}
	fmt.Printf("  idempotent: second sweep resolved 0; RaidResults still %d\n", guards)

	l.reportLadderTarget(rate)
	fmt.Printf("\nLOAD TEST PASSED\n")
	return nil
}

// seedWorld creates the attacker and defender clubs, their squads and their
// stored grids. Attackers and defenders are disjoint, so the lock order in
// resolveRaid (attacker row, then defender row) is identical across workers and
// a deadlock cycle is impossible.
func (l *loadtest) seedWorld(ctx context.Context) error {
	start := time.Now()
	l.attackers = make([]string, l.cfg.attackers)
	for i := range l.attackers {
		id, err := l.createClub(ctx, fmt.Sprintf("Load Attacker %03d", i), fmt.Sprintf("LA%03d", i), 1_000_000, 100_000, 1_000)
		if err != nil {
			return err
		}
		l.attackers[i] = id
	}
	l.defenders = make([]string, l.cfg.defenders)
	for i := range l.defenders {
		id, err := l.createClub(ctx, fmt.Sprintf("Load Defender %03d", i), fmt.Sprintf("LD%03d", i), 2_000_000, 200_000, 2_000)
		if err != nil {
			return err
		}
		l.defenders[i] = id
	}

	// Stored grids: the attacker's Match grid and the defender's Home grid (the
	// fixed snapshot a raid is resolved against, 05 §6).
	svc := grid.NewService(grid.NewPgRepository(l.pool))
	for _, id := range l.attackers {
		if err := svc.SaveLayout(ctx, id, grid.Match, attackGrid(), grid.MaxTier); err != nil {
			return fmt.Errorf("attacker match grid: %w", err)
		}
	}
	for _, id := range l.defenders {
		if err := svc.SaveLayout(ctx, id, grid.Home, defendGrid(), grid.MaxTier); err != nil {
			return fmt.Errorf("defender home grid: %w", err)
		}
	}
	fmt.Printf("\n  seeded %d clubs (squads + grids) in %s\n", len(l.attackers)+len(l.defenders), time.Since(start).Round(time.Millisecond))
	return nil
}

func (l *loadtest) createClub(ctx context.Context, name, code string, budget float64, fans, tokens int) (string, error) {
	row, err := db.InsertRow(ctx, l.pool, "Clubs", map[string]any{
		"Name": name, "ClubCode": code, "Budget": budget, "Fans": fans, "ScoutTokens": tokens,
		"StandingPoints": raidSeed, "ClubhouseTier": grid.MaxTier, "updatedAt": time.Now(),
	})
	if err != nil {
		return "", err
	}
	clubID := db.StringField(row, "_id")
	for i, pos := range strings.Split(playerPositions, ",") {
		if _, err := l.pool.Exec(ctx, `INSERT INTO "Players" ("ClubId","FirstName","LastName","Position","Rating","isSigned","isRetired","updatedAt")
			VALUES ($1,'Load',$2,$3,70,true,false,now())`, clubID, fmt.Sprintf("%s-%d", code, i), pos); err != nil {
			return "", err
		}
	}
	return clubID, nil
}

// queueRaids freezes N raids with distinct seeds (so the fake simulator's
// output is deterministic per raid and a replay is reproducible).
func (l *loadtest) queueRaids(ctx context.Context) error {
	start := time.Now()
	repo := play.NewRepository(l.pool)
	for i := 0; i < l.cfg.raids; i++ {
		attacker := l.attackers[i%len(l.attackers)]
		defender := l.defenders[i%len(l.defenders)]
		if _, err := repo.QueueRaid(ctx, play.RaidRequest{
			AttackerID: attacker, DefenderID: defender,
			Seed: fmt.Sprintf("load-%06d", i),
		}); err != nil {
			return fmt.Errorf("raid %d: %w", i, err)
		}
	}
	fmt.Printf("  queued %d raids in %s\n", l.cfg.raids, time.Since(start).Round(time.Millisecond))
	return nil
}

// drain runs `workers` parallel drain loops, each claiming a batch in its own
// transaction (exactly what the world-worker ticker does), until no pending
// raid is left. It returns the total resolved and the wall time.
//
// Correctness of "loop until a batch yields 0": SKIP LOCKED only skips rows
// locked by *other* transactions, and every lock is released when its worker
// commits, so the last worker to commit always re-scans the remaining pending
// rows. A final sequential pass guards the (racy) case where every worker
// retired just as another committed.
func (l *loadtest) drain(ctx context.Context) (int, time.Duration, error) {
	now := time.Now().UTC().Add(time.Second) // every queued raid is due
	var resolved int64
	errs := make(chan error, l.cfg.workers)
	start := time.Now()
	var wg sync.WaitGroup
	for w := 0; w < l.cfg.workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				n, err := drainOnce(ctx, l.pool, l.sim, l.cfg.batch, now)
				if err != nil {
					errs <- err
					return
				}
				if n == 0 {
					return
				}
				atomic.AddInt64(&resolved, int64(n))
			}
		}()
	}
	wg.Wait()
	close(errs)
	if err := <-errs; err != nil {
		return int(atomic.LoadInt64(&resolved)), time.Since(start), err
	}
	// Final sequential insurance pass.
	for {
		n, err := drainOnce(ctx, l.pool, l.sim, l.cfg.batch, now)
		if err != nil {
			return int(atomic.LoadInt64(&resolved)), time.Since(start), err
		}
		if n == 0 {
			break
		}
		atomic.AddInt64(&resolved, int64(n))
	}
	return int(atomic.LoadInt64(&resolved)), time.Since(start), nil
}

// drainOnce claims and resolves one batch in its own transaction.
func drainOnce(ctx context.Context, q db.Querier, sim play.Simulator, batch int, now time.Time) (int, error) {
	var n int
	err := db.WithTx(ctx, q, func(tx db.Querier) error {
		var err error
		n, err = play.ResolvePendingRaids(ctx, tx, now, sim, batch)
		return err
	})
	return n, err
}

// printStatus reports how many raids sit in each state after a drain, so an
// incomplete run shows exactly where the stragglers went.
func (l *loadtest) printStatus(ctx context.Context) error {
	rows, err := l.pool.Query(ctx, `SELECT "Status", count(*)::int AS n FROM "Raids" GROUP BY "Status" ORDER BY "Status"`)
	if err != nil {
		return err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return err
	}
	parts := make([]string, 0, len(list))
	for _, row := range list {
		parts = append(parts, fmt.Sprintf("%s=%v", db.StringField(row, "Status"), row["n"]))
	}
	fmt.Printf("  raid states: %s\n", strings.Join(parts, " "))
	return nil
}

// verify asserts no raid was applied twice and nothing was applied twice.
func (l *loadtest) verify(ctx context.Context, resolved int) error {
	// A raid the worker marked 'failed' never retries (internal/play), so it is
	// a hard failure: it means a per-raid error under concurrency.
	if failed, err := l.scalarInt(ctx, `SELECT count(*)::int FROM "Raids" WHERE "Status" = 'failed'`); err != nil {
		return err
	} else if failed > 0 {
		return fmt.Errorf("%d raids were marked failed by the worker (lock contention; run with 0 -attackers/-defenders for distinct clubs, or fewer -workers)", failed)
	}
	if resolved != l.cfg.raids {
		return fmt.Errorf("workers resolved %d raids, want %d", resolved, l.cfg.raids)
	}
	resolvedRows, err := l.scalarInt(ctx, `SELECT count(*)::int FROM "Raids" WHERE "Status" = 'resolved'`)
	if err != nil {
		return err
	}
	if resolvedRows != l.cfg.raids {
		return fmt.Errorf("resolved Raids rows = %d, want %d", resolvedRows, l.cfg.raids)
	}
	pending, err := l.scalarInt(ctx, `SELECT count(*)::int FROM "Raids" WHERE "Status" = 'pending'`)
	if err != nil {
		return err
	}
	if pending != 0 {
		return fmt.Errorf("%d raids still pending", pending)
	}
	failed, err := l.scalarInt(ctx, `SELECT count(*)::int FROM "Raids" WHERE "Status" = 'failed'`)
	if err != nil {
		return err
	}
	if failed != 0 {
		return fmt.Errorf("%d raids failed", failed)
	}
	guards, err := l.scalarInt(ctx, `SELECT count(*)::int FROM "RaidResults"`)
	if err != nil {
		return err
	}
	if guards != l.cfg.raids {
		return fmt.Errorf("RaidResults rows = %d, want exactly %d (one per raid)", guards, l.cfg.raids)
	}
	distinct, err := l.scalarInt(ctx, `SELECT count(DISTINCT "RaidId")::int FROM "RaidResults"`)
	if err != nil {
		return err
	}
	if distinct != l.cfg.raids {
		return fmt.Errorf("distinct RaidResults.RaidId = %d, want %d", distinct, l.cfg.raids)
	}
	fmt.Printf("  no double-apply: %d RaidResults for %d raids (guard is the PK)\n", guards, l.cfg.raids)

	// Standing identity: attackers only ever attack (the sets are disjoint), so
	// the attacker clubs' Standing moved by exactly the sum of the recorded
	// attacker deltas - a second application would break the identity.
	attInit := raidSeed * l.cfg.attackers
	defInit := raidSeed * l.cfg.defenders
	attFinal, err := l.sumStanding(ctx, l.attackers)
	if err != nil {
		return err
	}
	defFinal, err := l.sumStanding(ctx, l.defenders)
	if err != nil {
		return err
	}
	sumAttDelta, err := l.scalarInt(ctx, `SELECT coalesce(sum("StandingAttacker"),0)::int FROM "RaidResults"`)
	if err != nil {
		return err
	}
	sumDefDelta, err := l.scalarInt(ctx, `SELECT coalesce(sum("StandingDefender"),0)::int FROM "RaidResults"`)
	if err != nil {
		return err
	}
	if attFinal-attInit != sumAttDelta {
		return fmt.Errorf("attacker Standing moved %d, but recorded deltas sum to %d (double-apply?)", attFinal-attInit, sumAttDelta)
	}
	if defFinal-defInit != sumDefDelta {
		return fmt.Errorf("defender Standing moved %d, but recorded deltas sum to %d (double-apply?)", defFinal-defInit, sumDefDelta)
	}
	fmt.Printf("  Standing identity: attackers %d -> %d (%+d), defenders %d -> %d (%+d)\n",
		attInit, attFinal, attFinal-attInit, defInit, defFinal, defFinal-defInit)

	// Loot ledger: exactly one row per currency actually stolen, on each side.
	wantLoot, err := l.scalarInt(ctx, `SELECT
		(count(*) FILTER (WHERE "StolenCash" > 0)
		+ count(*) FILTER (WHERE "StolenFans" > 0)
		+ count(*) FILTER (WHERE "StolenTokens" > 0))::int FROM "RaidResults"`)
	if err != nil {
		return err
	}
	gotLootAtt, err := l.countIn(ctx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type"='raid_loot'`, `"BuyerClubId"`, l.attackers)
	if err != nil {
		return err
	}
	gotLootDef, err := l.countIn(ctx, `SELECT count(*)::int AS n FROM "TransferLedger" WHERE "Type"='raid_loot'`, `"SellerClubId"`, l.defenders)
	if err != nil {
		return err
	}
	if wantLoot != gotLootAtt || wantLoot != gotLootDef {
		return fmt.Errorf("raid_loot ledger rows: attacker %d, defender %d, want %d each", gotLootAtt, gotLootDef, wantLoot)
	}
	fmt.Printf("  ledger: %d attacker + %d defender raid_loot rows (one per currency stolen each)\n", gotLootAtt, gotLootDef)

	// Star-bonus ledger: one `form_bonus` row per raid that actually credited the
	// Board Vault, identified by its note (the P6 Form Bonus window writes
	// `form_bonus` rows too, with a different note, so a note filter is exact).
	wantBonus, err := l.scalarInt(ctx, `SELECT count(*)::int FROM "RaidResults" WHERE "SystemBonus" > 0`)
	if err != nil {
		return err
	}
	gotBonus, err := l.scalarInt(ctx, `SELECT count(*)::int FROM "TransferLedger"
		WHERE "Type"='form_bonus' AND "Note"='Board Vault star bonus' AND "BuyerClubId"::text = ANY($1)`, l.attackers)
	if err != nil {
		return err
	}
	if wantBonus != gotBonus {
		return fmt.Errorf("star-bonus ledger rows = %d, want %d", gotBonus, wantBonus)
	}
	fmt.Printf("  Board Vault: %d star-bonus ledger rows (one per credited raid)\n", gotBonus)
	return nil
}

// reportLadderTarget compares the measured throughput to the P10 target
// ("≥ attacks/hour needed at peak ladder", 06 §Benchmarks). The peak-ladder
// demand is an assumption stated in the output, not a measured constant.
func (l *loadtest) reportLadderTarget(rate float64) {
	// A full StandingPool is league.PoolSize (100) clubs; the apex allowance is
	// 30 attacks/week each. One pool's peak is ~3000 attacks/week.
	const poolSize = 100
	const peakAttacksPerClubPerWeek = 30
	poolPerHour := float64(poolSize*peakAttacksPerClubPerWeek) / (7 * 24)
	// A large world: ~1000 pools (100k clubs at peak ladder).
	worldPerHour := poolPerHour * 1000
	fmt.Printf("\nLADDER TARGET (assumption: peak pool = %d clubs x %d attacks/week; 1000 pools)\n",
		poolSize, peakAttacksPerClubPerWeek)
	fmt.Printf("  one pool peak  : %.0f attacks/hour\n", poolPerHour)
	fmt.Printf("  1000-pool world: ~%.0f attacks/hour (%.1f attacks/sec)\n", worldPerHour, worldPerHour/3600)
	fmt.Printf("  measured       : %.0f matches/sec = %.0f attacks/hour\n", rate, rate*3600)
	if rate*3600 >= worldPerHour {
		fmt.Printf("  => meets the peak-ladder target with %.0fx headroom\n", rate*3600/worldPerHour)
	} else {
		fmt.Printf("  => SHORT of the target by %.0fx\n", worldPerHour/(rate*3600))
	}
}

// --- simulator selection ---------------------------------------------------

// chooseSimulator returns the real sim-service when reachable (or when forced),
// otherwise the deterministic fake, with a label that is always printed.
func chooseSimulator(ctx context.Context, mode string) (play.Simulator, string) {
	switch strings.ToLower(mode) {
	case "fake":
		return fakeSim, "deterministic in-process fake (forced by -sim=fake)"
	case "real":
		if !simHealthy(ctx) {
			fmt.Fprintf(os.Stderr, "loadtest: -sim=real but no sim-service at %s\n", clients.SimServiceURL())
			os.Exit(2)
		}
		return clients.SimulateMatch, "real sim-service at " + clients.SimServiceURL()
	default:
		if simHealthy(ctx) {
			return clients.SimulateMatch, "real sim-service at " + clients.SimServiceURL()
		}
		return fakeSim, "deterministic in-process fake (no sim-service at " + clients.SimServiceURL() + ")"
	}
}

func simHealthy(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, clients.SimServiceURL()+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// fakeSim is a deterministic function of the frozen request: same seed => same
// match, so a replay is byte-identical (05 §6) and the load test is repeatable
// without the engine. It only replaces the goal/possession numbers the engine
// would return; every DB write (loot, Standing, shield, ledger) still runs.
func fakeSim(_ context.Context, request map[string]any) (map[string]any, error) {
	seed, _ := request["seed"].(string)
	h := fnv.New32a()
	_, _ = h.Write([]byte(seed))
	v := h.Sum32()
	att := int(v % 4)
	def := int((v >> 8) % 4)
	poss := 40.0 + float64(v%41)
	return map[string]any{
		"Details": map[string]any{
			"HomeTeamScore": att, "AwayTeamScore": def,
			"HomeTeamDetails": map[string]any{"Possession": poss, "XG": 0.3 + float64(att)*0.7},
			"AwayTeamDetails": map[string]any{"Possession": 100 - poss, "XG": 0.2 + float64(def)*0.6},
		},
		"Events": []any{},
		"Frames": map[string]any{},
	}, nil
}

// --- grids -----------------------------------------------------------------

// attackGrid is a tier-5-legal attacking shape (Match grid).
func attackGrid() grid.Grid {
	return grid.Grid{Slots: []grid.Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: grid.GK},
		{Col: 1, Row: 1, PlayerID: "d1", Position: grid.DEF},
		{Col: 1, Row: 3, PlayerID: "d2", Position: grid.DEF},
		{Col: 1, Row: 5, PlayerID: "d3", Position: grid.DEF},
		{Col: 2, Row: 2, PlayerID: "d4", Position: grid.DEF},
		{Col: 3, Row: 0, PlayerID: "m1", Position: grid.MID},
		{Col: 3, Row: 2, PlayerID: "m2", Position: grid.MID},
		{Col: 3, Row: 4, PlayerID: "m3", Position: grid.MID},
		{Col: 3, Row: 6, PlayerID: "m4", Position: grid.MID},
		{Col: 6, Row: 2, PlayerID: "a1", Position: grid.ATT},
		{Col: 6, Row: 4, PlayerID: "a2", Position: grid.ATT},
	}}
}

// defendGrid is a tier-5-legal low block (Home grid) - a defender snapshot.
func defendGrid() grid.Grid {
	return grid.Grid{Slots: []grid.Slot{
		{Col: 0, Row: 3, PlayerID: "gk", Position: grid.GK},
		{Col: 1, Row: 1, PlayerID: "d1", Position: grid.DEF},
		{Col: 1, Row: 2, PlayerID: "d2", Position: grid.DEF},
		{Col: 1, Row: 3, PlayerID: "d3", Position: grid.DEF},
		{Col: 1, Row: 4, PlayerID: "d4", Position: grid.DEF},
		{Col: 1, Row: 5, PlayerID: "d5", Position: grid.DEF},
		{Col: 3, Row: 0, PlayerID: "m1", Position: grid.MID},
		{Col: 3, Row: 2, PlayerID: "m2", Position: grid.MID},
		{Col: 3, Row: 4, PlayerID: "m3", Position: grid.MID},
		{Col: 3, Row: 6, PlayerID: "m4", Position: grid.MID},
		{Col: 6, Row: 3, PlayerID: "a1", Position: grid.ATT},
	}}
}

// --- small query helpers ---------------------------------------------------

func (l *loadtest) scalarInt(ctx context.Context, sql string, args ...any) (int, error) {
	var v int64
	if err := l.pool.QueryRow(ctx, sql, args...).Scan(&v); err != nil {
		return 0, fmt.Errorf("query %q: %w", sql, err)
	}
	return int(v), nil
}

func (l *loadtest) sumStanding(ctx context.Context, ids []string) (int, error) {
	return l.scalarInt(ctx, `SELECT coalesce(sum("StandingPoints"),0)::int FROM "Clubs" WHERE "_id"::text = ANY($1)`, ids)
}

func (l *loadtest) countIn(ctx context.Context, query, column string, ids []string) (int, error) {
	return l.scalarInt(ctx, query+` AND `+column+`::text = ANY($1)`, ids)
}

// --- database admin (mirrors cmd/dod: throwaway DB, never the template) ----

func openAdmin(ctx context.Context) (*db.Pool, string, error) {
	dsn := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(dsn) == "" {
		dsn = defaultDatabaseURL
	}
	admin, err := db.New(ctx, replaceDatabase(dsn, "postgres"), 30*time.Second, nil)
	if err != nil {
		return nil, "", fmt.Errorf("admin pool: %w", err)
	}
	return admin, dsn, nil
}

func ensureDatabase(ctx context.Context, admin *db.Pool, target, source string) error {
	if _, err := admin.Exec(ctx, `DROP DATABASE IF EXISTS `+quoteIdent(target)+` WITH (FORCE)`); err != nil {
		return fmt.Errorf("drop %q: %w", target, err)
	}
	if _, err := admin.Exec(ctx, `CREATE DATABASE `+quoteIdent(target)+` TEMPLATE `+quoteIdent(source)); err != nil {
		return fmt.Errorf("create %q from template %q: %w", target, source, err)
	}
	return nil
}

func dropDatabase(ctx context.Context, admin *db.Pool, target string) error {
	_, err := admin.Exec(ctx, `DROP DATABASE IF EXISTS `+quoteIdent(target)+` WITH (FORCE)`)
	return err
}

func quoteIdent(name string) string { return `"` + strings.ReplaceAll(name, `"`, `""`) + `"` }

func databaseName(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(u.Path, "/")
}

func replaceDatabase(dsn, name string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return dsn
	}
	u.Path = "/" + name
	return u.String()
}
