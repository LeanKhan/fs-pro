# Simulation Implementation Tracker

This document tracks the practical implementation of the simulator evolution described in `SIMULATION-PLAN.md`.

The goal is to make the current TypeScript match engine measurable, modular, chunkable, resource-aware, and MVP-ready without rewriting it in another runtime.

## Guiding Principle

Teams decide what they are trying to do.
Players decide what they intend to do.
The match engine decides what actually happens.

## Status Legend

- `Not started` - no implementation work yet
- `In progress` - implementation has started
- `Blocked` - cannot continue without a decision or dependency
- `Done` - implemented and verified

## Milestone 1 - Baseline Current Simulator

**Status:** Done (2026-09-05)

**Purpose:** Freeze current behavior with measurable output before changing architecture.

**Code Areas**

- `src/scripts/simRealismCheck.ts`
- `src/scripts/dumpSimulationRosterPool.ts` (new)
- `src/jobs/matchSimWorker.ts`
- `src/jobs/matchQueue.ts`
- `src/classes/Match.ts`
- `src/state/ImmutableState/Actions/Decider.ts`

**Tasks**

- [x] Define `SimulationMetrics` shape - `IMatchSummary`/the `buildMetricsMap()` label set in `simRealismCheck.ts`.
- [x] Add aggregate metrics for goals, shots, shots on target, passes, possession, fouls, cards, tackles, dribbles, and events.
- [x] Add distribution buckets, not only averages - p10/p50/p90 per metric, alongside mean/min-max.
- [x] Save baseline output to `tmp/simulation-baseline.json`.
- [x] Add a command for repeatable baseline runs - `npx ts-node src/scripts/simRealismCheck.ts [count]`, DB-free (see below).

**Acceptance Criteria**

- [x] Can run at least 1,000 matches from the command line - verified live, 1000 matches in ~5-6s.
- [x] Output includes both averages and distributions.
- [x] Baseline file can be compared with a later run - `npx ts-node src/scripts/simRealismCheck.ts --compare <fileA> <fileB>`.

**Notes from implementation:**

- The script is now fully DB-free at the call-site level: `dumpSimulationRosterPool.ts` is a separate, one-time (rerun-when-you-want-fresher-data) script that fetches real Clubs+Players+resolved Manager tactics once and writes them to a checked-in `src/scripts/fixtures/simulation-roster-pool.json`; `simRealismCheck.ts` loads that JSON and calls `App.setupGame(..., prefetchedClubs, prefetchedTactics)` - the exact prefetch shape `matchSimWorker.ts` already used in production.
- Real, load-bearing constraint found live: `App.ts`'s import graph still transitively reaches `db/drizzle/index.ts` -> `DrizzleUserRepository` -> `utils/auth.ts` -> `sessionStore.ts`, which eagerly constructs a Postgres client and throws at _module load time_ if `DATABASE_URL` isn't set - even though nothing in this call path ever queries it. `simRealismCheck.ts` calls `dotenv.config()` purely to satisfy that unrelated eager check (documented inline). This coupling is exactly what Milestone 2's zero-import package boundary will remove for good - worth remembering when scoping that milestone.
- The "acceptable baseline ranges" open decision below was already answered in code before this pass (`REFERENCE_RANGES` in `simRealismCheck.ts`) - this pass added `Possession % (home team)` (wide band, [20,80], since clubs are randomly paired rather than skill-matched) and a diagnostic-only `Events per match` metric (no invented "real-world" range - it's an internal engine count, not a real football stat).
- A pre-existing (not introduced by this pass) intermittent crash surfaced during the 1000-match runs: `Actions.pass` throws `Cannot read properties of undefined (reading 'BlockPosition')` on a small fraction of matches (~3-5%), preceded by "NO ACTIVE PLAYERS" / "2 players simultaneously have WithBall" log lines. Already tolerated by the harness's own per-match try/catch (failed matches are skipped, not fatal) - flagged here for whoever picks up Milestone 6/7 (explicit transitions / player policy), not fixed as part of this pass per the "no behavior changes" rule.
- Also pre-existing, not fixed: an `EventEmitter` `MaxListenersExceededWarning` on `<ball-id>-ball-moved` (~25 listeners per match, default cap 24) - each match's ball id is unique so this isn't a real cross-match leak, just Node's default heuristic being conservative for one match's ~22 players + referee. Redirect stderr when running large batches (`2>/dev/null` or to a log file) if the noise is distracting.

## Milestone 2 - Isolate the engine under src/simulation/ (revised scope)

**Status:** Done (2026-09-06) - revised scope, see note below

**Purpose:** Move toward a package that receives plain data and returns plain simulation results.

**Revision note:** After weighing it (see the simulation-engine-isolation
plan), a real `packages/simulation` npm workspace package was deferred -
none of Milestones 3-22 actually require the package boundary to exist
first, and the cost (workspace/build wiring, and duplicating several
small files that turned out to be used far beyond the simulation core:
`interfaces/Player.ts`, `interfaces/Club.ts`, `helpers/misc.ts`, every
`controllers/*/​*.model.ts`) wasn't worth it yet. Instead, the engine was
physically reorganized into `apps/fs-pro-server/src/simulation/`,
mirroring the folder structure a real package would have, with a narrow
`simulation/index.ts` barrel (`Game`, `Coordinates`, `matchEvents`,
`ballMove`, `createMatchEvent`, `ITactic`) that would become that future
package's `src/index.ts` verbatim. A future real extraction is now a
near-mechanical "move this one folder out + add package.json/tsconfig +
change a handful of import specifiers from relative paths to
`@repo/simulation`" - not a redesign.

**What moved into `src/simulation/`:** `Game.ts`, `Match.ts`,
`MatchSide.ts`, `FieldPlayer.ts`, `Ball.ts`, `Player.ts`, `Club.ts`,
`Referee.ts`, `Actions.ts`, `Decider.ts`, `FieldGrid.ts`, `Formations.ts`,
`coordinates.ts`, `probability.ts`, `events.ts`. `utils/players.ts` was
split (not moved wholesale) - it was shared with the CRUD/training layer,
but the two function sets turned out to be completely disjoint
(engine-only: `getATTMID`/`getATTMIDNoFilter`/`getRandomATTMID`/`getGK`/
`getRandomDEF`/`findRandomFreeBlock`/`findFarthestFreeBlock`/
`findFreeBlock`/`sortFromKeeperDown`, now in
`simulation/utils/players.ts`; CRUD/training-only:
`calculatePlayerRating/Value/Wage`/`attributesToIncrease`/
`newAttributeRatings`/`distributeAttributePoints`/`liveAttributePool`/
`poolSizeScale`/`generatePlayer`/`MATCH_GROWTH_SCALE`, stayed in
`utils/players.ts`) - verified line-by-line before splitting, avoiding a
repeat of the exact "two divergent copies of the same formula" bug this
session's `player_rating_recompute_fix` already found and fixed once.

`App.ts` stays exactly where it is, unmoved - its DB-fallback branch
(`getClubs()`/`resolveManagerTactic()`) is genuinely exercised by the
live HTTP kickoff path (confirmed at the call site), so it stays a thin,
DB-aware orchestrator that now imports `Game`/`Coordinates`/
`matchEvents`/`ITactic` from `../../simulation` instead of local relative
paths. `interfaces/Player.ts`/`interfaces/Club.ts`/`helpers/misc.ts`/
`helpers/logger.ts`/all `controllers/*/​*.model.ts` files were **not**
duplicated or moved - they stay in place and the moved engine files just
reach back out to them via a relative path one level deeper. Also deleted
`classes/Block.ts` (confirmed dead code, zero importers).

**Verified live:** `tsc --noEmit` clean; `simRealismCheck.ts` re-run at
1000 matches and `--compare`d against a pre-move baseline - near-zero
deltas (same noise band as two unseeded pre-move runs), proving zero
behavior change; the real HTTP `GET /game/kickoff-new/:fixture` path
tested against a real unplayed league fixture (200 OK, correct score,
standings updated) - proves `App.ts`'s still-DB-aware orchestration
works end-to-end through the new file layout; `matchSimWorker.ts`
verified directly (a real worker_thread run, 180 frames, valid result),
confirming the queued/worker path also resolves the new module layout
correctly.

**Acceptance Criteria**

- [x] Simulation code is cleanly isolated (`src/simulation/`) - not yet a
      real installable package, but the same import surface.
- [x] Existing match simulation still works through the current app flow.
- [x] Package input/output is JSON-serializable (unchanged from before -
      not part of this pass's scope, N/A until Milestone 3).

## Milestone 3 - Introduce Match State

**Status:** Done

**Purpose:** Make match progress resumable and inspectable.

**Target Structure**

```text
apps/fs-pro-server/src/simulation/state/
  MatchState.ts
```

**Tasks**

- [x] Define `MatchState`.
- [x] Define `BallState`.
- [x] Define `PossessionState`.
- [x] Define `TeamMatchState`.
- [x] Define `PlayerMatchState`.
- [x] Add conversion from existing `Match`/`MatchSide` objects to `MatchState`.
- [x] Add conversion from `MatchState` back to current result shape.

**Implementation Notes**

Added `src/simulation/state/MatchState.ts` as the first serializable
state bridge around the current object-oriented engine. The live `Match`
class now exposes `toState()` and `toDetailsFromState()`, while the
simulation barrel exports `createMatchStateSnapshot`,
`matchStateToDetails`, and the state types.

The snapshot deliberately separates player permanent identity/attributes
from match-only state (`status`, `onPitch`, coordinates, cards/stats,
points, possession). Substitutes are currently represented on the team by
ID because they are still plain `Player` objects until substituted into
the match, while `PlayerMatchState` is reserved for actual `FieldPlayer`
instances with coordinates and live match state.

Possession is canonicalized during snapshot creation. If the old mutable
engine ever has multiple players marked `WithBall`, the snapshot selects
one holder and derives every player's `hasBall` from that single
`PossessionState`, giving downstream systems one authoritative ball owner.

**Correction (found while scoping Milestone 5):** `TeamMatchState.tactic`
originally stored the live `IActiveTactic` as-is - its `slots[].block` is
a real `IBlock` with circular `Field`/`occupant` back-references, so
`JSON.stringify` on a `MatchState` actually threw, contradicting "plain,
serializable snapshot". Fixed in the Milestone 5 pass by adding a
genuinely plain `SimulationTactic` type and converting `team.Tactic` to
it in `createTeamState` - safe since `toState()` had zero callers at the
time (confirmed dead code). Also worth knowing for anyone building real
cross-process resume later: `MatchState.random` only captures `Match`'s
own `RandomSource` fork - `Game` independently forks 4 more (`ball`/
`referee`/`actions`/`decider`), none of which expose their state anywhere
yet, and there is still no rehydration function (`MatchState` -> a live,
tickable object graph) - only the forward (live -> snapshot) direction
exists.

**Acceptance Criteria**

- [x] A match state snapshot contains enough data to continue simulation.
- [x] Player permanent attributes are separated from match-specific state.
- [x] Ball possession has a single canonical owner.

## Milestone 4 - Seeded Randomness

**Status:** Done

**Purpose:** Make simulation reproducible for debugging, regression checks, and future Go parity.

**Target Structure**

```text
apps/fs-pro-server/src/simulation/randomness/
  RandomSource.ts
  index.ts
```

**Tasks**

- [x] Define `RandomSource`.
- [x] Add seeded RNG implementation.
- [x] Thread RNG through new simulation package boundary.
- [x] Replace simulation-path `Math.random()` calls incrementally.
- [x] Preserve existing behavior as much as possible during the first pass.

**Implementation Notes**

Added `RandomSource`, `SeededRandomSource`, `SystemRandomSource`,
`createRandomSource`, `setSimulationRandomSource`, and small helper
functions under `src/simulation/randomness/`. `Game` now accepts an
optional `RandomInput` seed/source and threads forked RNGs into `Match`,
`Ball`, `Referee`, `Actions`, and `Decider`. Existing callers still work
without changes because the default source delegates to `Math.random()`.

The remaining simulation-path direct random calls in `coordinates.ts`,
`players.ts`, and `probability.ts` now use the simulation RNG context, so
seeded runs cover pass/shot probability, free-block selection, missed-shot
landing blocks, and nearby-player random tie-style choices.

This is still intentionally a first deterministic bridge: it makes the
current engine seedable without changing the public HTTP/gameplay shape.
Milestones 5 and 6 should use the stored `random` state on `MatchState`
when chunk/resume support starts consuming snapshots directly.

**Acceptance Criteria**

- [x] Same request plus same seed produces the same result.
- [x] Baseline runner can run deterministic comparisons.

## Milestone 5 - Chunked Simulation (revised scope: same-process only)

**Status:** Done (2026-09-06) - revised scope, see note below

**Purpose:** Allow matches to advance to natural stopping points for human/AI manager decisions.

**Revision note:** Investigated what true cross-process serialize/resume
(the tracker's `advanceMatch(state, {until})` sketch, `state` implying a
plain snapshot) would require, and it's much bigger than this milestone's
one-line phrasing suggests - see Milestone 3's revision note below for
the concrete gaps found (tactic-field circularity, zero rehydration code,
4 of 5 RandomSource forks uncaptured, listener-teardown-is-process-wide-
not-scoped). Per user decision, this pass scopes to **same-process
pause/resume only**: the live `Game`/`Match` object graph stays in
memory across chunks - no teardown, no rehydration, no new RNG-capture
work. True serialize-to-disk/resume-after-restart is deferred as a
separate future milestone.

**Target API** (implemented as `game.advanceMatch(until)`, an instance
method on the live `Game` - not `advanceMatch(state, ...)` taking a plain
snapshot, since that would imply the deferred cross-process model):

```ts
game.advanceMatch({ event: 'half-time' });
game.advanceMatch({ event: 'full-time' });
game.advanceMatch({ minute: 60 });
// { event: 'next-stoppage' } deliberately NOT implemented - would need
// Actions.interruption to bubble up as a real pause point.
```

**Tasks**

- [x] Define `AdvanceUntil` (`simulation/controllers/Game.ts`).
- [x] Define `advanceMatch()` - `Game.advanceMatch(until)`, tracks a new
      `currentTick`/`halfTimeTransitionDone` pair of private fields so
      calls are resumable across the same Game instance.
- [x] Support half-time and full-time boundaries first (also supports
      arbitrary minute boundaries - clamped [0,180] ticks - in the same
      pass, since the tracker's own already-answered Open Decision said
      to support both).
- [x] Store enough state to resume after a chunk - N/A for same-process
      scope (nothing is torn down between chunks, so nothing needs
      storing) - would become relevant if/when cross-process resume is
      tackled separately.
- [ ] Add manager/game transition helpers - explicitly deferred to
      Milestone 6/7/21 (Explicit Transitions / Team Intent / Manager AI) -
      this pass only builds the primitive those will call between chunks.

**Bonus fix (found while scoping, not part of the original task list):**
`MatchState.teams.*.tactic` (Milestone 3) held a live `IActiveTactic`
whose `slots[].block` is a real `IBlock` with circular `Field`/`occupant`
back-references - `JSON.stringify` on a `MatchState` threw. Fixed by
adding a genuinely plain `SimulationTactic` type
(`simulation/state/MatchState.ts`) and converting `team.Tactic` to it in
`createTeamState`. Safe since nothing calls `toState()` yet.

**Verified live:** `tsc --noEmit` clean; `simRealismCheck.ts --compare`
against the pre-change baseline (deltas within the same unseeded-sampling
noise band as prior milestones); a new direct determinism check - two
separately-constructed `Game` instances with the **same seed**, one run
straight through via `startHalf()`, one advanced in chunks
(`{minute:20}` → `{minute:45}` → `{minute:70}` → `{event:'full-time'}`) -
produced **bit-for-bit identical results**: same score/events/passes/
shots, and all 180 frames' ball positions matched exactly. This is the
real proof chunking is transparent to simulation output. Also re-verified
the real HTTP `GET /game/kickoff-new/:fixture` path against a genuine
unplayed fixture (200 OK, correct score, standings updated).

**Acceptance Criteria**

- [x] CPU-vs-CPU match can run first half, pause, then run second half
      (already true before this pass via the hardcoded two-call
      structure; now generalized to arbitrary boundaries too).
- [x] Match result is saved only after final state (unchanged -
      persistence still only happens in `game.controller.ts`'s `.then()`
      after the whole `startGame()` promise resolves).
- [ ] Human and AI manager decisions can both apply through the same
      transition functions - N/A this pass, no transition/decision API
      exists yet (Milestone 6/21's job).

## Milestone 6 - Explicit Transitions

**Status:** Not started

**Purpose:** Prevent arbitrary state mutation and make world changes auditable.

**Transition Types**

- `applyTacticalChange`
- `applySubstitution`
- `applyCard`
- `applyGoal`
- `applyPossessionChange`
- `applyMatchEvent`

**Tasks**

- [ ] Define transition result shape.
- [ ] Add validation inside transition functions.
- [ ] Emit structured events from transitions.
- [ ] Replace direct mutation where practical.

**Acceptance Criteria**

- [ ] Invalid substitutions/tactical changes are rejected.
- [ ] Transitions produce events.
- [ ] Match state invariants are protected.

## Milestone 7 - Team Intent And Player Policy

**Status:** Not started

**Purpose:** Separate team-level tactical choices from individual player decisions.

**Target Structure**

```text
src/simulation/team/
  TeamController.ts
  TeamIntent.ts

src/simulation/player/
  PlayerPolicy.ts
  RuleBasedPlayerPolicy.ts
  PlayerObservation.ts
  ObservationBuilder.ts
```

**Tasks**

- [ ] Define `TeamIntent`.
- [ ] Define `PlayerObservation`.
- [ ] Define `PlayerIntent`.
- [ ] Wrap current `Decider.makeDecision()` inside `RuleBasedPlayerPolicy`.
- [ ] Keep existing pass/shot/tackle/dribble outcome formulas for now.

**Acceptance Criteria**

- [ ] Team intent is computed before player decisions.
- [ ] Player policy receives observation and team intent.
- [ ] Decision logic and outcome logic are no longer treated as the same thing.

## Milestone 8 - Resolver Layer

**Status:** Not started

**Purpose:** Move execution/outcome logic out of player decision logic.

**Target Structure**

```text
src/simulation/resolver/
  IntentResolver.ts
  PassResolver.ts
  ShotResolver.ts
  TackleResolver.ts
  MovementResolver.ts
```

**Tasks**

- [ ] Move pass outcome logic into `PassResolver`.
- [ ] Move shot outcome logic into `ShotResolver`.
- [ ] Move tackle outcome logic into `TackleResolver`.
- [ ] Move movement outcome logic into `MovementResolver`.
- [ ] Keep current formulas initially.

**Acceptance Criteria**

- [ ] Player policy chooses intent only.
- [ ] Resolvers decide what actually happens.
- [ ] Existing match event/result shape remains compatible with the app.

## Milestone 9 - Engine Contract And Resource Controls

**Status:** Not started

**Purpose:** Make simulation callable through a stable internal contract and keep heavy work from overwhelming the Node server.

**Tasks**

- [ ] Finalize `SimulateMatchRequest` JSON contract.
- [ ] Finalize `SimulateMatchResult` JSON contract.
- [ ] Add contract fixtures/examples.
- [ ] Add simulation queue concurrency controls.
- [ ] Add per-match timeout/error handling.
- [ ] Add lightweight simulation performance metrics.
- [ ] Keep Node responsible for auth, DB reads/writes, Socket.IO, and replay broadcasting.

**Acceptance Criteria**

- [ ] Node calls the TypeScript engine through one stable internal interface.
- [ ] Match simulations do not block regular API/auth/frontend communication.
- [ ] Simulation concurrency can be tuned by environment variable.
- [ ] No database writes are required inside the simulation engine.

## Milestone 10 - Spatial Analysis Services

**Status:** Not started

**Purpose:** Move geometry and space-reading behavior into reusable services instead of burying it in player decisions.

**Target Structure**

```text
src/simulation/spatial/
  SpatialAnalyzer.ts
  PassingAnalyzer.ts
  PressureAnalyzer.ts
```

**Tasks**

- [ ] Move pressure counting into `PressureAnalyzer`.
- [ ] Move pass-lane geometry into `PassingAnalyzer`.
- [ ] Add nearest teammate/opponent helpers.
- [ ] Add goal distance and angle helpers.
- [ ] Add open-space and space-ahead helpers.
- [ ] Add defensive-line and team-compactness helpers.

**Acceptance Criteria**

- [ ] Player policy asks spatial services for context instead of doing geometry directly.
- [ ] Passing, shooting, pressing, and movement can share the same spatial facts.
- [ ] Existing match outcomes remain broadly within baseline ranges after extraction.

## Milestone 11 - Possession And Match Phases

**Status:** Not started

**Purpose:** Make attacking/defending behavior depend on the current football phase, not only on who has the ball.

**Phases**

- `restart`
- `build-up`
- `progression`
- `final-third`
- `chance`
- `attacking-transition`
- `defensive-transition`
- `defensive-shape`
- `press`
- `counter`

**Tasks**

- [ ] Add `PossessionState.sequenceId`.
- [ ] Track possession start/end.
- [ ] Assign each event to a possession sequence.
- [ ] Add phase transitions for restarts, buildup, progression, final-third, chances, counters, and defensive shape.
- [ ] Feed phase into `TeamIntent`.
- [ ] Record possession duration metrics.

**Acceptance Criteria**

- [ ] Event logs can explain which possession produced a shot/goal/turnover.
- [ ] Teams behave differently in buildup, transition, and final-third phases.
- [ ] Possession changes are explicit state transitions.

## Milestone 12 - Formation Anchors And Team Shape

**Status:** Not started

**Purpose:** Make players move from a role/formation home position rather than simply chasing the ball or goal.

**Tasks**

- [ ] Define normalized `FormationAnchor`.
- [ ] Map current formations to anchors.
- [ ] Blend anchor, ball position, team intent, and role bias into a target position.
- [ ] Keep width and team shape during buildup/defending.
- [ ] Add shape behavior for high line, low block, compactness, and wide/narrow play.

**Acceptance Criteria**

- [ ] Teams visibly keep shape in replay frames.
- [ ] Players do not collapse onto one shared destination.
- [ ] Tactical width and defensive line affect positioning.

## Milestone 13 - Passing Options And Decision Evaluation

**Status:** Not started

**Purpose:** Change passing from "can I pass?" to "which passes are available and how valuable are they?"

**Target Shape**

```ts
interface PassingOption {
  playerId: string;
  distance: number;
  forwardProgress: number;
  laneRisk: number;
  receiverPressure: number;
  expectedRetention: number;
  expectedThreat: number;
}
```

**Tasks**

- [ ] Generate candidate short, long, backward, through, and wide pass options.
- [ ] Score each pass by retention, progress, threat, receiver pressure, and lane risk.
- [ ] Let team intent adjust pass scoring.
- [ ] Separate pass selection from pass execution success.
- [ ] Add metrics for pass type distribution and completion by type.

**Acceptance Criteria**

- [ ] A player can choose a specific receiver and pass type.
- [ ] Riskier tactics produce more direct passes and more turnovers.
- [ ] Safer tactics produce higher retention and longer possessions.

## Milestone 14 - Off-Ball Behavior

**Status:** Not started

**Purpose:** Make non-ball players actively create or deny options.

**Attacking Intents**

- `support`
- `make-run`
- `overlap`
- `underlap`
- `hold-width`
- `move-between-lines`
- `attack-box`
- `drop-deep`

**Defensive Intents**

- `press`
- `mark`
- `cover`
- `track-run`
- `hold-line`
- `drop`
- `block-lane`

**Tasks**

- [ ] Add `decideWithBall()`.
- [ ] Add `decideWithoutBall()`.
- [ ] Add attacking off-ball support and run logic.
- [ ] Add defensive marking, covering, pressing, and lane blocking.
- [ ] Make passing options depend on off-ball movement.

**Acceptance Criteria**

- [ ] Receivers move into space before passes happen.
- [ ] Defenders can deny passing lanes without always tackling.
- [ ] Match replays show coordinated movement away from the ball.

## Milestone 15 - Player Roles And Tendencies

**Status:** Not started

**Purpose:** Make players with the same broad position behave differently.

**Example Roles**

- `goalkeeper`
- `sweeper-keeper`
- `centre-back`
- `ball-playing-defender`
- `full-back`
- `wing-back`
- `holding-midfielder`
- `deep-playmaker`
- `box-to-box`
- `attacking-midfielder`
- `winger`
- `inside-forward`
- `target-forward`
- `poacher`
- `false-nine`

**Tasks**

- [ ] Define `PlayerRole`.
- [ ] Define `PlayerTendencies`.
- [ ] Add role defaults for width, directness, dribbling, shooting, pressing, and discipline.
- [ ] Allow player personality/tendencies to modify role defaults.
- [ ] Feed role and tendencies into `PlayerPolicy`.

**Acceptance Criteria**

- [ ] Two players with the same position can choose noticeably different actions.
- [ ] Role affects off-ball movement and on-ball choices.
- [ ] Tactics, role, ability, and tendencies combine instead of relying on only `GK/DEF/MID/ATT`.

## Milestone 16 - Simultaneous Intentions And Tick Loop

**Status:** Not started

**Purpose:** Move from sequential player scripting toward snapshot-based decisions and resolved conflicts.

**Tasks**

- [ ] Define simulation tick length.
- [ ] Build each tick from a stable state snapshot.
- [ ] Collect player intentions before mutating state.
- [ ] Resolve movement, passes, tackles, interceptions, and shots after intentions are collected.
- [ ] Record only meaningful public events while keeping enough internal tick data for debugging/replay.

**Acceptance Criteria**

- [ ] Players decide from the same tick snapshot.
- [ ] Conflicts are resolved by the resolver layer, not by loop order.
- [ ] Replay frames remain compatible with the current frontend.

## Milestone 17 - Independent Ball Model

**Status:** Not started

**Purpose:** Make the ball a real match-state object rather than only a player possession flag.

**Target Shape**

```ts
interface BallState {
  position: Coordinate;
  velocity?: Coordinate;
  holderId?: string;
  target?: Coordinate;
  state: 'controlled' | 'passing' | 'shooting' | 'loose' | 'out-of-play';
}
```

**Tasks**

- [ ] Make `BallState` the canonical source of ball ownership.
- [ ] Derive player `hasBall`/`WithBall` from `BallState`.
- [ ] Model pass and shot travel with start, destination, speed, and arrival tick.
- [ ] Allow interceptions based on ball path and defender movement.
- [ ] Add loose-ball recovery behavior.

**Acceptance Criteria**

- [ ] Impossible multi-holder ball states are prevented.
- [ ] Pass interceptions can happen because of ball trajectory and positioning.
- [ ] Saves, misses, goals, and restarts produce clear ball states.

## Milestone 18 - Score-Based Decisions

**Status:** Not started

**Purpose:** Replace brittle threshold chains with ranked candidate actions.

**Tasks**

- [ ] Generate candidate actions for pass, carry, dribble, shoot, hold, and support.
- [ ] Score actions by context, player ability, role, tendencies, team intent, pressure, and match phase.
- [ ] Choose probabilistically from scored actions rather than always picking the top score.
- [ ] Track decision score and chosen action in debug events.
- [ ] Keep execution success separate from decision quality.

**Acceptance Criteria**

- [ ] Better mental/decision attributes improve option selection.
- [ ] Technical attributes still control execution quality.
- [ ] Players show variation without pure randomness.

## Milestone 19 - Simulation Config And Calibration

**Status:** Not started

**Purpose:** Centralize magic numbers and make behavior tunable without hunting through engine code.

**Target Structure**

```text
packages/simulation/config/
  SimulationConfig.ts
  defaultSimulationConfig.ts
```

**Tasks**

- [ ] Move thresholds for shooting, passing, dribbling, tackling, fouls, pressing, and movement into config.
- [ ] Add config override support for scripts/tests.
- [ ] Add tactic sensitivity tests.
- [ ] Add calibration notes for expected football ranges.
- [ ] Compare each tuning pass against the baseline metrics.

**Acceptance Criteria**

- [ ] Simulation behavior can be tuned from one config surface.
- [ ] Tactical changes produce measurable differences.
- [ ] Calibration changes are backed by before/after metrics.

## Milestone 20 - Fatigue, Confidence, And Player Memory

**Status:** Not started

**Purpose:** Make player state evolve during the match.

**Tasks**

- [ ] Add `PlayerMatchCondition`.
- [ ] Track stamina, fatigue, confidence, sharpness, and injury risk.
- [ ] Make fatigue affect movement, pressing, control, tackle timing, and shot precision.
- [ ] Add short-term player memory for recent shots, failed dribbles, pressure, and last action.
- [ ] Let repeated success/failure nudge confidence and action preference.

**Acceptance Criteria**

- [ ] High pressing has a visible cost over 90 minutes.
- [ ] Late-match behavior differs from early-match behavior.
- [ ] Players can adapt slightly based on recent outcomes.

## Milestone 21 - Manager And AI Decisions

**Status:** Not started

**Purpose:** Let human and AI managers alter the same match state through the same transition system.

**Tasks**

- [ ] Define `ManagerDecision`.
- [ ] Add halftime AI manager decision hook.
- [ ] Add tactical changes based on score, minute, cards, fatigue, and match stats.
- [ ] Add substitution decisions.
- [ ] Apply human and AI decisions through the same transition helpers.

**Acceptance Criteria**

- [ ] CPU teams can react at halftime.
- [ ] Human manager choices use the same state transitions as AI choices.
- [ ] Tactical/substitution changes affect the second-half simulation.

## Milestone 22 - Behavior Regression Suite

**Status:** Not started

**Purpose:** Make football behavior testable as the engine becomes more sophisticated.

**Tasks**

- [ ] Add test fixtures for contrasting team styles.
- [ ] Add cautious-vs-direct tactic comparison.
- [ ] Add high-press fatigue comparison.
- [ ] Add role behavior comparison.
- [ ] Add possession/phase distribution reports.
- [ ] Add replay sanity checks for shape, ball ownership, and event ordering.

**Acceptance Criteria**

- [ ] Behavior changes can be reviewed with metrics.
- [ ] Tactics and roles produce expected differences.
- [ ] No match can finish with invalid ball ownership or corrupted player state.

## Open Decisions

- [ ] Should `packages/simulation` be named `@repo/simulation` or `@fspro/simulation`? Answer: `@repo/simulation`
- [ ] What is the first supported chunk boundary: half-time only, or arbitrary minute too? Answer: Should support both named and minute boundaries.
- [ ] Should match states be persisted before full-time in the MVP? Answer: Yes
- [ ] Should replay frames stay in the same result payload, or be stored separately? Answer: Frames should stay in result payload
- [ ] What fixture/player snapshot fields are required for a self-contained simulation request? Answer: Use existing fixture/snapshot fields
- [ ] What should the default simulation queue concurrency be for the MVP deployment? Answer: Use best
- [ ] Which roles should ship first for MVP?
- [x] What are acceptable baseline ranges for goals, shots, pass completion, fouls, and cards? Answer: see `REFERENCE_RANGES` in `simRealismCheck.ts` - already implemented, not just decided.
- [ ] Should tick length start at 1 simulated second, 2 seconds, or current minute-like ticks?
- [ ] Should player tendencies be generated from existing attributes or added as stored player fields?
- [ ] Should manager AI initially act only at halftime, or also at configurable minute/stoppage points?

## Verification Checklist

Run these after meaningful simulator changes:

- [ ] `npm.cmd run tsc --workspace fs-pro-server`
- [ ] `npm.cmd run lint --workspace fs-pro-server`
- [ ] `npm.cmd run build --workspace fs-pro-client`
- [ ] Simulation baseline command
- [ ] One live match from the UI
- [ ] One queued match simulation
- [ ] One replay playback
- [ ] Possession/phase distribution check
- [ ] Tactic sensitivity comparison
- [ ] Role behavior comparison
- [ ] Ball ownership invariant check

## Notes

- Do not move DB logic into the simulation package.
- Keep simulation in TypeScript for this implementation track.
- Do not tune football behavior while doing the first architecture extraction unless required to preserve existing behavior.
- Start behavior changes only after the baseline and package boundary are stable.
- Behavior changes must include metrics or replay evidence.
- Prefer small, measurable changes over a large rewrite.
