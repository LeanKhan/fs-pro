# B2-2A-REPORT.md — phase 2, Batch 2, Agent 2A

**Branch:** `p2/b2-2a` (worktree `.claude/worktrees/p2b2a`, from
`p2/integration` @ `a32a776`). **Scope:** the pure Go owner-program engine, the
balance simulator, the frozen contract and the api-contract zod shapes (R11, R3′).
No Node money/DB code and no client files were touched.

## 0. Deliverables

| # | Deliverable | Path |
| --- | --- | --- |
| 1 | Frozen wire contract (written first) | `docs/perfect/phase-2/PROGRAM-SERVICE-CONTRACT.md` |
| 2 | Steps, predicates, stars, rewards, tips, HTTP + validation | `services/world-service/internal/program/**`, `internal/http/server.go` |
| 3 | Balance simulator | `services/world-service/internal/program/sim/**` |
| 4 | zod shapes (R6) | `packages/api-contract/src/schemas/program-service.ts` (+ exports in `src/index.ts`) |
| 5 | Tests | `internal/program/*_test.go`, `internal/program/sim/*_test.go`, `internal/http/program_test.go` |

`internal/program` is new. `internal/http/server.go` gained five routes and
handlers; `cmd/world-service/main.go` needed **no** change (the engine is pure,
so the HTTP layer calls the package directly and there is nothing to wire).

### Files changed

```
 M packages/api-contract/src/index.ts                 +62
 M services/world-service/internal/http/server.go    +92
?? docs/perfect/phase-2/PROGRAM-SERVICE-CONTRACT.md
?? packages/api-contract/src/schemas/program-service.ts
?? services/world-service/internal/http/program_test.go
?? services/world-service/internal/program/
```

## 1. The contract (`PROGRAM-SERVICE-CONTRACT.md`)

Written before the code, frozen for 2B/2C. It pins the request/response JSON for
every program endpoint the spec calls for:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/program/steps` | step table, per-step rewards, XP caps, fees |
| POST | `/program/evaluate` | completion, 1–3 stars, reward XP, reasons, advisor framing |
| POST | `/program/next` | the next step after re-checking the predicate |
| POST | `/program/tip` | the single highest-priority eligible advisor line |
| POST | `/program/simulate` | the balance simulator report |

It defines `StepFacts` (the whole pure input), `AdvisorLine` (adopted from
`ADVISOR-SPEC.md` §5.1, with `cooldown` → `cooldownSeconds`), the exact star
clauses per step, the reward table, the full tip-rule table with trigger,
priority, cooldown/max/once and expression, validation rules and the
`simulate` report shape. `AdvisorLine` carries `speaker`, `expr`, `pose`,
`target`, `priority`, `dismissible`, `maxShows`, `cooldownSeconds` and `once`,
so 3A can render every field without guessing.

## 2. Step engine (`internal/program`)

- `program.go` — enums and the `StepFacts`/`AdvisorLine`/request/response types,
  plus request validation.
- `stars.go` — `evaluateStep` for the four steps: the completion predicate and
  the ★1/★2/★3 clauses exactly as §3.2 of the spec, with deterministic
  `reasons`.
- `rewards.go` — `{1:3,2:9,3:18}`, cap 54, match XP `{30,10,5}`, fees.
- `steps.go` — `Steps()`, `Evaluate()`, `Next()`.
- `tips.go` — the rule table (4 step beats × their lines + balance reveal + 12
  contextual tips) and `Tip()`. Selection filters by trigger, dismissal,
  `maxShows`, cooldown and the quiet floor (70), then sorts by priority desc /
  id asc.

Interpretation recorded for 2B: `PlayerBudget` in the step-1 star clause is the
drawn starting balance (`StepFacts.startingBalance`), and `facts.programXp`
excludes the step being evaluated so a re-evaluation is idempotent.

## 3. HTTP (`internal/http/server.go`)

Five routes registered alongside the existing world-service routes. Handlers
validate first and answer `400 { "error": ... }` (unknown step, `step !=
facts.step`, negative counts, missing/≤0 `now`, bad JSON, balance/runs out of
range, unknown strategy). The engine is stateless, so there is no DB call and
no request context.

## 4. zod shapes (`packages/api-contract`)

`schemas/program-service.ts` mirrors every Go shape field-for-field; exported
from `index.ts` next to the world-service block. `tsc --noEmit` on the package
is clean (§5.5). Note for the lead: `index.ts` is also touched by 2B's route
exports; the two edits are additive and merge cleanly.

## 5. Commands and output (R4)

`go` = `/mnt/c/Program Files/Go/bin/go.exe` (`go1.24.5 windows/amd64`) via
`cmd.exe`, `GOTOOLCHAIN=local` set inside a `.bat` (env does not cross
WSL→Windows). `go test -race` runs in `golang:1.24-bookworm`.

### 5.1 `go test ./...` (Windows, fresh)

```
ok  	fs-pro-world-service/internal/http	1.100s
ok  	fs-pro-world-service/internal/program	0.587s
ok  	fs-pro-world-service/internal/program/sim	3.802s
... (all 11 packages ok) ...
```

### 5.2 `go vet ./...` and `gofmt -l`

```
VET_EXIT=0
(gofmt -l internal/program: no output)
```

### 5.3 Benchmarks (`-bench . -benchmem -benchtime=5x`, windows i7-11800H)

```
BenchmarkEvaluate-16    	     5	  26040 ns/op	  7814 B/op	198 allocs/op
BenchmarkTip-16         	     5	   5280 ns/op	  2240 B/op	 28 allocs/op
BenchmarkSteps-16       	     5	   2260 ns/op	  3584 B/op	 45 allocs/op
BenchmarkSimulate1000-16	     5	 91288000 ns/op	58076080 B/op	311702 allocs/op
BenchmarkRunOne-16      	     5	 174820 ns/op	 57628 B/op	310 allocs/op
```

`/program/simulate` at 1,000 runs costs ~91 ms wall (parallel across cores),
so the endpoint is safe to call synchronously.

### 5.4 `go vet` + `go test ./...` + `go test -race` in Docker

```
VET_OK
ok  	fs-pro-world-service/internal/program	0.006s
ok  	fs-pro-world-service/internal/program/sim	2.838s
... (all 11 packages ok) ...
TEST_OK
ok  	fs-pro-world-service/internal/program	1.023s
ok  	fs-pro-world-service/internal/program/sim	14.218s
RACE_OK
```

The race build exercises `TestProgramConcurrentEndpoints` (32 goroutines:
evaluate + simulate + steps) and the simulator's parallel `runAll` worker pool.
No data races.

### 5.5 api-contract typecheck

```
$ (worktree) C:\done\fs-pro\node_modules\.bin\tsc.cmd --noEmit
(no output)
```

## 6. Balance simulator (`internal/program/sim`)

### 6.1 Design (deterministic, pure)

- Cost/reward tables are the spec's own: `freeAgentValue(rating, age)`
  (`§5.2`), `managerFee(overall)`/`wage` (`§5.3`), Tier-1 `upgradeCost`
  (`§5.4`), programs XP/match XP (`§3.2`).
- Pools are sampled from the spec §6.1 histograms (rating, age, position,
  manager overall).
- Five strategies: `random`, `facilities_first`, `splurge_on_manager`,
  `all_in_on_players`, `balanced_expert`. Each takes a legal squad and a Tier-1
  through the real recovery path (match income, player sale, board advance) and
  then plays qualifying friendlies until `clubXp ≥ 100`.
- Stars are evaluated with the **live** `program.Evaluate` at the moment each
  step completes, so the "cash left after" clauses mean what the game means.
- Every run is seeded from `(seed, runIndex)`; runs are independent and
  reproducible in any order or parallelism (`TestSimDeterminism`,
  `TestSimDeterminismAcrossChunking`).

### 6.2 Match-outcome provenance (no invented numbers)

Two `sim-lab` runs are committed under `sim/testdata/`:

```
sim-lab.exe 10000 realism : home W/D/L 44/24/31  (the owner is always home)
sim-lab.exe 10000 quality : gap 0-3 34/35/30 | 3-8 56/27/17 | 8-15 83/12/5 | 15+ 96/3/1
```

`OutcomeProb(gap)` interpolates the band midpoints from the realism home-even
point `(0, 0.44/0.24/0.31)` up through the quality bands, mirroring for
negative gaps; `opponentXI` follows closest-power matchmaking
(`play.service.ts:202-217`: the 5 nearest clubs) as `own + N(0,2)`, clamped
40–90. `TestOutcomeProbBands` pins the values.

### 6.3 Key numbers (1,000 seeded runs per cell, seed 4242)

Time in simulated session-minutes (contract §8.3); `soft` = soft-locked runs.

| Strategy | V1M median (recovery) | V3M median (recovery) | V5M median (recovery) |
| --- | --- | --- | --- |
| `random` | 137 (745) | 91 (167) | 84 (32) |
| `facilities_first` | 84 (0) | 84 (0) | 84 (0) |
| `splurge_on_manager` | 84 (0) | 84 (0) | 84 (0) |
| `all_in_on_players` | 144 (887) | 130 (600) | 105 (457) |
| `balanced_expert` | **84 (0)** | **84 (0)** | **84 (0)** |

Star totals (sum of the four steps, out of 12): `balanced_expert` 9–10 at every
balance; `random` mostly 4–6; `all_in_on_players` 4–6. **Soft-locked: 0 in every
cell.** Match count median is 7 everywhere; p10–p90 for the expert is 5–7 at
V1M and V3M.

**L7 note (for Batch 4A).** `balanced_expert @ V1M` (84) ties
`random @ V5M` (84): under the real tables both need three friendly wins
(program XP 36 vs ~27), and the session model plateaus at 7 matches /
20-minute build. The spec's stronger claim ("expert@V1M strictly faster than
random@V5M") is therefore **not** yet met by the default knobs; the truly naive
strategies (`random @ V1M` 137, `all_in @ V1M` 144, `all_in @ V5M` 105) are
1.3–1.7× slower and recover, so strategy clearly matters. `TestSkillBeatsLuckV1`
logs the comparison and only fails on a regression past random@V5M. The tuning
knobs (XP rewards, cash floors, interaction/cooldown minutes, strategy targets)
are named constants in `sim/model.go`/`sim/sim.go` for 4A.

## 7. Test inventory

| Test | What it proves |
| --- | --- |
| `TestManagerStep` / `TestPlayersStep` / `TestFacilitiesStep` / `TestLevel1Step` | one table per step: predicate true/false and every star boundary |
| `TestRewardTable`, `TestEvaluationXpAggregation`, `TestStepsConfig` | rewards, cap 54, level1 pays 0 |
| `TestNextStep` | the strict guidance order, incl. `done` |
| `TestValidation` | request constraints |
| `TestTipSelectionPriorityAndCooldown`, `TestTipQuietSuppressesLowPriority`, `TestAdvisorLineShape`, `TestEvaluateAdvisorLine` | rule priority, dismissal, maxShows, quiet floor, balance reveal |
| `TestDeterminism` (evaluate) | same input → same output |
| `TestOutcomeProbBands`, `TestCostCurves` | sim-lab bands and the spec cost curves |
| `TestSimDeterminism`, `TestSimDeterminismAcrossChunking` | seeded reproducibility |
| `TestSimNoSoftLocks`, `TestExpertBeatsNaiveAtEqualBalance`, `TestSkillBeatsLuckV1` | 0 soft-locks; skill ordering; L7 logged |
| `TestProgram*Endpoint`, `TestProgramConcurrentEndpoints` | HTTP shapes, validation and race safety |
| Benchmarks | evaluate/tip/steps/runOne/simulate1000 |

## 8. Acceptance criteria

| Criterion (brief) | Status | Evidence |
| --- | --- | --- |
| Frozen contract written first | **PASS** | §1, file exists |
| Steps, predicates, stars, rewards, tips | **PASS** | §2, `program_test.go` |
| HTTP endpoints + validation | **PASS** | §3, `internal/http/program_test.go` |
| zod shapes (R6) | **PASS** | §4, `tsc --noEmit` clean |
| Simulator: real reward/cost + sim-lab outcomes | **PASS** | §6.2, testdata + `TestOutcomeProbBands` |
| Simulator: time-to-L1, soft-locks, final squad/Tiers | **PASS** | §6.3 |
| Table tests per step, race tests, benchmarks, sim determinism | **PASS** | §5, §7 |
| `go test -race` in Docker | **PASS** | §5.4 |
| 0 soft-locks at every balance | **PASS** | §6.3 |
| balanced-expert: skill beats luck (L7, strict) | **GAP** | §6.3 L7 note — ties random@V5M; for 4A tuning |

## 9. Assumptions / gaps

1. **`PlayerBudget` = starting balance** in the step-1 ratio (§2). Recorded in
   the contract; 2B must pass the drawn balance.
2. **`programXp` excludes the step under evaluation**; `POST /program/evaluate`
   returns the inclusive total. Recorded in the contract §3.
3. **Simulator session-time model** (interaction budgets, 5-minute cooldowns,
   20-minute build, 60-minute recovery) is an explicit, tunable model in
   `sim/sim.go`, not a game constant; it is documented in contract §8.3.
4. **L7 strict median** is not met at the default knobs (§6.3); 4A owns tuning.
5. `index.ts` is shared with 2B's exports; the edits are additive (R11).
