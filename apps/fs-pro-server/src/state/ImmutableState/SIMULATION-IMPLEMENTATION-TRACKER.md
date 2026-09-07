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

**Status:** Done (2026-09-06)

**Purpose:** Prevent arbitrary state mutation and make world changes auditable.

**Transition Types**

- `applyTacticalChange`
- `applySubstitution`
- `applyCard`
- `applyGoal`
- `applyPossessionChange`
- `applyMatchEvent`

**Revision note:** Investigation before writing this found "validation
that can reject" is a genuinely new concept for this codebase - every
mutation path was unconditional (the only guard anywhere was one
idempotency check, `Referee.sendOff()`'s double-send-off bail), and
nothing live ever attempted an invalid transition (the half-time sub
auto-planner and the tactic-swap caller are both structurally incapable
of producing bad input). So this milestone is infrastructure for a
future caller (a manager/AI decision surface - Milestone 7/21, not built
yet), not a fix for anything currently broken. Design choice: don't
rewrite Referee/Actions/Match's calibrated dice-roll/event-chain
internals - extract the two that were pure inline listener bodies
(`Match.recordGoal()`, extracted from the `-goal!` listener;
`Referee.bookPlayer()`, already a method, just flipped from private to
public) into callable methods, then wrap all six in validating
functions in a new `simulation/transitions/index.ts`.

**Tasks**

- [x] Define transition result shape - `TransitionResult<T>` (success
      with `data`/`events`, or `{success:false, error}`).
- [x] Add validation inside transition functions.
- [x] Emit structured events from transitions - `applyTacticalChange`/
      `applySubstitution`/`applyMatchEvent` do; `applyCard`/`applyGoal`/
      `applyPossessionChange` deliberately don't (see below).
- [x] Replace direct mutation where practical - `Game.substituteSide()`,
      `Game.swapClubFormations()`, `Game.changeTactic()`,
      `Game.gameLoop()`'s possession call, and `Referee.handleFoul()`'s
      card branch all now go through the transitions instead of mutating
      directly.

**Why `applyCard`/`applyGoal` emit no event of their own:** found live
while implementing - both would have **duplicated** an event that
already exists. `Referee.handleShot()`'s `'goal'` case already narrates
every goal (a second, independent listener chain from the one
`Match.recordGoal()`'s score mutation lives on); `Match`'s `-game-halt`
listener already narrates every foul including carded ones (and
`-player-sent-off` narrates the send-off itself). Emitting again from
`applyGoal`/`applyCard` would have doubled those events for every live
match - caught before shipping by comparing "Events per match" against
the pre-change baseline. `applyTacticalChange`'s event is NOT a
duplicate - `Game.swapClubFormations()` emitted nothing before this pass
(only `Game.changeTactic()`, zero live callers, did) - so half-time
tactic swaps are now visible in `Match.Events`/replay for the first time
(a real, intentional improvement, confirmed as the expected +2/match
shift in the diagnostic event-count metric, not a regression).

**A real bug caught by the new rejection-path test, not by the
regression check:** `applyTacticalChange`'s first validation attempt
checked `side.ActivePlayers.length !== 11` - looks right, but
`MatchSide.changeTactic()` actually re-walks the raw `StartingSquad`
array (which keeps growing across substitutions - an outgoing player is
marked `'substituted'` but never removed), not the `ActivePlayers`-
filtered view. After exactly one substitution, `ActivePlayers.length` is
back at 11 (10 still-active originals + 1 incoming) while
`StartingSquad.length` is 12 - the buggy check would have passed
validation and then crashed inside `changeTactic()` itself (reproduced
live, `TypeError: Cannot read properties of undefined ('block')` in
`MatchSide.getBlock()`). Fixed to check `StartingSquad.length !== 11`
instead. This is exactly why the plan called for a dedicated rejection-
path test separate from the regression check - the regression check
alone (no live caller ever exercises a post-substitution tactic change)
would never have caught this.

**Verified live:** `tsc --noEmit` clean; `simRealismCheck.ts --compare`
against the pre-change baseline - every gameplay metric within normal
unseeded-sampling noise, only the diagnostic "Events per match" metric
shifted (+2.3, matching the two new tactic-swap narration events per
match, exactly as expected); a dedicated rejection-path script exercising
all six transitions - GK-outgoing/GK-incoming/wrong-side substitution
rejections, past-`MAX_SUBSTITUTIONS` rejection, unknown-formation/style
rejections, the post-substitution tactic-change rejection above (after
the fix), already-sent-off double-card rejection, sent-off-player-can't-
score rejection, and a side-not-in-this-match possession rejection - all
12 checks passed, alongside their legitimate-input counterparts
succeeding; real HTTP `GET /game/kickoff-new/:fixture` against a genuine
unplayed fixture (200 OK, correct score, standings updated).

**Acceptance Criteria**

- [x] Invalid substitutions/tactical changes are rejected.
- [x] Transitions produce events (where doing so wouldn't duplicate an
      existing one - see above).
- [x] Match state invariants are protected (the `StartingSquad`-vs-
      `ActivePlayers` bug above is exactly this acceptance criterion
      doing its job).

## Milestone 7 - Team Intent And Player Policy

**Status:** Done (2026-09-06)

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
  PlayerIntent.ts (not in the original target list - added since "Define
    PlayerIntent" needed a home; co-located with its toPlayerIntent/
    toStrategy converters)
```

**Tasks**

- [x] Define `TeamIntent` - honestly just today's `IPlayingStyle`
      (Formations.ts) renamed/exposed as a first-class thing (`tempo`/
      `pressing`/`defensiveLine`/`positionalDiscipline`/`width`/
      `directness`) - NOT computed from anything dynamic yet.
      `mentality`/`focus`/`risk`/`phase` from the plan doc's sketch are
      deliberately not included - no real signal exists anywhere yet to
      compute them from (needs Milestone 11's phase tracking or 18's
      score-based decisions); inventing placeholder values would be
      premature abstraction.
- [x] Define `PlayerObservation` - formalizes what `Decider.ts` already
      computed ad hoc (pressure via a radius-3 opponent count, "3
      closest teammates" via the same selection `passability()` already
      used, goal distance). `passingOptions`/`availableSpace`-shaped
      fields from the plan doc are deliberately NOT included - real
      candidate-receiver scoring is Milestone 13's job, spatial analysis
      sharing is Milestone 10's; adding placeholders now would be scope
      creep into those milestones.
- [x] Define `PlayerIntent` - a cleaner, better-named discriminated union
      (`{kind:'pass', passType}` / `{kind:'shoot', shotType}` /
      `{kind:'move'}`) than today's `IStrategy` - NOT yet a richer one
      (no real `targetId` - the pass receiver is still resolved later
      inside `Actions.pass()` from `passType` alone, exactly as it was
      from `IStrategy.detail` before this pass). `toPlayerIntent`/
      `toStrategy` are lossless 1:1 mappers, verified by a direct
      round-trip test over all 6 real `IStrategy` shapes `Decider.ts`
      can produce.
- [x] Wrap current `Decider.makeDecision()` inside `RuleBasedPlayerPolicy` - wraps the **existing** `Decider` instance `Actions.ts` already
      builds (passed in via constructor), not a second one - building a
      second instance from the same forked seed would desync the shared
      RNG call ordering between decision-making and outcome-formula
      calls even though each instance stays individually deterministic.
- [x] Keep existing pass/shot/tackle/dribble outcome formulas for now -
      `Decider`'s internals are 100% unchanged; `RuleBasedPlayerPolicy`
      receives `observation`/`teamIntent` (satisfying the acceptance
      criterion below) but doesn't yet make `Decider` consume them
      instead of recomputing equivalent values itself - that's Milestone
      10's job (Spatial Analyzer, a single shared source both would pull
      from).

**Acceptance Criteria**

- [x] Team intent is computed before player decisions -
      `Actions.takeAction()` calls `determineIntent()` before
      `playerPolicy.decide()`.
- [x] Player policy receives observation and team intent - both are
      genuinely computed (`buildObservation()`/`determineIntent()`) and
      passed into `decide()` every call, not just declared in the type
      signature.
- [x] Decision logic and outcome logic are no longer treated as the same
      thing - `RuleBasedPlayerPolicy.decide()` (decision) is now a
      distinctly named, separate layer from `Decider`'s
      `getPassResult`/`getShotResult`/`getTackleResult`/
      `getDribbleResult` (outcome), which `Actions.ts` still calls
      directly and unchanged.

**Verified live:** `tsc --noEmit` clean; a direct round-trip check
(`toStrategy(toPlayerIntent(s))` for all 6 real strategy shapes) - all
passed exactly; `simRealismCheck.ts --compare` against the pre-change
baseline - every metric within the same unseeded-sampling noise band as
every prior milestone; real HTTP `GET /game/kickoff-new/:fixture`
against a genuine unplayed fixture (200 OK, correct score, standings
updated).

## Milestone 8 - Resolver Layer

**Status:** Done (2026-09-06)

**Purpose:** Move execution/outcome logic out of player decision logic.

**Target Structure**

```text
src/simulation/resolver/
  PassResolver.ts
  ShotResolver.ts
  TackleResolver.ts   (also holds dribble resolution - see note)
```

`IntentResolver.ts` and `MovementResolver.ts` (listed in the original
target structure) were **not** built this pass - see the revision note.

**Revision note:** Unlike Milestone 7 (where wrapping `Decider.
makeDecision()` instead of moving it was the safe choice - it's deeply
entangled with the rest of that class), the four outcome methods
(`getPassResult`/`getDribbleResult`/`getTackleResult`/`getShotResult`)
turned out to be already fully self-contained (none call each other or
get called from elsewhere in `Decider.ts`, each has exactly one call
site in `Actions.ts`) - a genuinely safe **relocation**, matching the
tracker's own wording here ("**Move** X into Y", not "wrap").

Two real gaps found in the tracker's own spec, resolved by judgment
rather than invented: no `DribbleResolver.ts` was ever listed despite
dribble clearly being a 4th outcome formula - folded into
`TackleResolver` instead (the two are already tightly coupled: a failed
dribble falls straight into a tackle attempt in `Actions.move()` today).
And confirmed via grep that **no dice-roll "movement outcome formula"
exists anywhere** - `move()`/`movePlayersForward()`/`movePlayersBackward()`/
`holdShape()`/`pressureBall()`/`FieldPlayer.move()` are all pure
coordinate arithmetic. So no `MovementResolver` or `IntentResolver` was
built - there's nothing to extract without inventing structure for
behavior that doesn't exist (movement) or a dispatcher not called for by
this pass's task list (intent routing - `Actions.takeAction()`'s existing
switch already does that job).

A real risk caught **before writing any resolver code**: `getShotResult`
rolls `Decider`'s own seeded `RandomSource` (via `getShotTarget()`) in
the same temporal sequence as every other roll `Decider.makeDecision()`
makes. Giving the new `ShotResolver` a _freshly forked_ random (the
naive move) would draw from a differently-ordered stream - the same
underlying class of bug Milestone 7 avoided by wrapping the existing
`Decider` instance rather than building a second one. Fixed by making
`Decider.random` `public` (was `private`) and constructing `ShotResolver`
with that _exact same instance_. `PassResolver`/`TackleResolver` have no
such concern - their formulas route through `utils/probability.ts`'s
`getResult()`, which draws from a separate global random singleton,
unrelated to `Decider`'s instance (a pre-existing fact, not something
this milestone changes).

**Tasks**

- [x] Move pass outcome logic into `PassResolver` - verbatim, minus two
      confirmed-dead bits (an unread `luck` parameter, and a `tally`/
      `chance` computation immediately overwritten by the real
      `getResult()` call after it).
- [x] Move shot outcome logic into `ShotResolver` - verbatim, including a
      small deliberate duplicate of `Decider`'s private `isNearPost()`
      (which stays in `Decider.ts`, still used by decision-making's
      `whatKindaPass()`) - the same small-duplication tradeoff already
      made for `helpers/logger.ts`/`misc.ts` back in Milestone 2.
- [x] Move tackle outcome logic into `TackleResolver` - verbatim, plus
      dribble resolution (see revision note).
- [ ] Move movement outcome logic into `MovementResolver` - not built,
      no formula exists to move (see revision note).
- [x] Keep current formulas initially - verified via a formula-
      equivalence script run BEFORE deleting anything from `Decider.ts`
      (see below), not just asserted.

**Verified live:** `tsc --noEmit` clean; a dedicated formula-equivalence
script comparing old `Decider` methods against the new resolvers -
Pass/Tackle/Dribble compared statistically (20,000 trials each, since
their formulas draw from a shared global random that a 1:1 sequential
comparison would perturb) landed within 0.0000-0.0036 success-rate delta;
Shot's `onTarget` (which uses the shared seeded instance) compared
exactly 1:1 across 500 trials - 500/500 identical, confirming the
random-sharing fix actually works; Shot's `goal` rate compared
statistically (20,000 trials) - 0.0009 delta. Only after all of this
passed were `Actions.ts`'s 5 call sites rewired and `Decider.ts`'s four
methods (plus the now-orphaned private `getShotTarget`) deleted.
`simRealismCheck.ts --compare` against the pre-change baseline - every
metric within the same noise band as every prior milestone; real HTTP
`GET /game/kickoff-new/:fixture` against a genuine unplayed fixture (200
OK, correct score, standings updated).

**Acceptance Criteria**

- [x] Player policy chooses intent only (already true after Milestone 7
      in effect; now also true at the file/class level - `Decider` no
      longer has any outcome-resolution code on it at all).
- [x] Resolvers decide what actually happens - for pass/shot/tackle/
      dribble. Movement's "outcome" stays deterministic geometry inside
      `Actions.ts`, unchanged (nothing to resolve).
- [x] Existing match event/result shape remains compatible with the app -
      unchanged; only which class performs each outcome roll changed,
      not any event/mutation/return shape downstream of it.

## Milestone 9 - Engine Contract And Resource Controls

**Status:** Done

**Purpose:** Make simulation callable through a stable internal contract and keep heavy work from overwhelming the Node server.

**Tasks**

- [x] Finalize `SimulateMatchRequest` JSON contract.
- [x] Finalize `SimulateMatchResult` JSON contract.
- [x] Add contract fixtures/examples.
- [x] Add simulation queue concurrency controls.
- [x] Add per-match timeout/error handling.
- [x] Add lightweight simulation performance metrics.
- [x] Keep Node responsible for auth, DB reads/writes, Socket.IO, and replay broadcasting.

**Acceptance Criteria**

- [x] Node calls the TypeScript engine through one stable internal interface.
- [x] Match simulations do not block regular API/auth/frontend communication.
- [x] Simulation concurrency can be tuned by environment variable.
- [x] No database writes are required inside the simulation engine.

**Implementation notes**

Different in kind from Milestones 5-8: this one is about the Node/engine
_boundary_ itself, not an internal engine refactor.

Investigation before writing anything found the tracker's own acceptance
criteria weren't actually true yet: `kickoffNew` (the real, client-facing
route - `game.router.ts` → `play()` in `game.controller.ts`) called
`App.setupGame()`/`App.startGame()` directly, and `Game.gameLoop()`'s
~180-tick loop ran fully synchronously inside the Express handler,
blocking Node's event loop for the whole match. A separate, already-built
`worker_threads` path (`jobs/matchQueue.ts` + `matchSimWorker.ts`) existed
but was wired only to a debug-only `enqueueMatch` route (used by
`PitchPreview.html`), with a hardcoded `MAX_CONCURRENT_MATCHES = 1`, no
timeout, and no persistence. Asked whether to close this gap for real or
just harden the debug path and disclose the gap - decided to move the
real `kickoffNew` path onto the worker queue too, so both share one
contract-shaped entry point.

**New: `jobs/simulationContract.ts`** - `SimulateMatchRequest`
(`fixtureId`, plain-JSON `clubs`, `sides`, `tactics`),
`SimulatedMatchData` (extends the existing `IReplayableMatch` with
`Events` and `ManagerId` on Home/Away - both needed by `play()`'s
persistence step but missing from the worker's prior output),
`SimulationMetrics` (`queuedAt`/`startedAt`/`finishedAt`/`queueWaitMs`/
`simulationMs`/`totalMs`), and `SimulateMatchResult` (`{ok:true,match,
metrics}` or `{ok:false,error,metrics}`).

**New: `jobs/buildSimulateMatchRequest.ts`** - the clubs-fetch +
tactics-resolve-if-not-prefetched logic that used to live inline in
`App.setupGame()` and duplicated in `matchQueue.ts`'s old `runMatchJob`,
now shared by both callers. Does not fetch the Fixture itself - both
callers already have it for their own reasons.

**`jobs/matchQueue.ts`** - rewritten around one new exported
`simulateMatch(request): Promise<SimulateMatchResult>`, the "one stable
internal interface": `MAX_CONCURRENT_MATCHES` now reads
`process.env.SIMULATION_MAX_CONCURRENT_MATCHES` (default bumped `1`→`2` -
this is real traffic now, `1` would serialize every simultaneous kickoff
across all users behind one worker); new `SIMULATION_MATCH_TIMEOUT_MS`
env var (default 30000) wraps the worker lifecycle with a timer that
calls `worker.terminate()` and resolves `{ok:false}` on a hang (nothing
enforced this before); queue internals generalized from a fixture-id-only
array to job records, since real traffic means multiple different
fixtures queue at once, not just one debug fixture; metrics captured
around the worker call and logged as one `[simulation-metrics]` line per
match. `enqueueMatchPlay` (the debug path) is now a thin wrapper around
`simulateMatch()` - same fire-and-forget/dedup/no-persistence behavior as
before for `PitchPreview.html`.

**`jobs/matchSimWorker.ts`** - added `ManagerId` to the Home/Away objects
in its posted result (the one confirmed gap versus what `play()` needs
downstream). `App.setupGame()`/`startGame()` are still called exactly as
before, inside the worker, still DB-free.

**`game.controller.ts`'s `play()`** - replaced the direct
`App.setupGame()`+`App.startGame()` call with
`buildSimulateMatchRequest()` then `simulateMatch()`; the rest of the
`.then()` chain (`startMatchReplay`, `saveReplay`, `updateFixture`,
`updateStandings`, `advanceDayIfDone`) is untouched - confirmed before
writing any code that every field it reads off the resolved match
(`Home`/`Away` identity incl. `ManagerId`, `Details`, `Events`, `Frames`)
is plain data, not a live-instance method, so the worker's plain
`SimulatedMatchData` is a drop-in replacement for the old live `Match`
object. `App`/`CurrentMatch.App` bookkeeping (`new App()`, `endGame()`
calls) stays in place as harmless now-dead-ish scaffolding rather than
ripping it out for a milestone that isn't about `App.ts` itself.

**Contract fixtures/examples**: `jobs/__fixtures__/simulate-match-*.example.json`,
generated from one real dev fixture via a throwaway script (deleted
after use) - clubs' player rosters and the result's Frames array trimmed
to a couple of entries each so the examples stay readable while still
showing the real shape.

**Verified live**: `tsc --noEmit` clean. `simRealismCheck.ts --compare`
against a pre-milestone baseline (965 vs 957 matches) - all metrics
within normal unseeded-sampling noise, as expected since no engine
formula changed. Timeout path verified with a throwaway script
(`SIMULATION_MATCH_TIMEOUT_MS=50` against a real DB-free synthetic match

- `simulateMatch()` correctly resolved `{ok:false}` with a timeout error
  and terminated the worker). Concurrency verified the same way
  (`SIMULATION_MAX_CONCURRENT_MATCHES=2`, 3 concurrent `simulateMatch()`
  calls - the first two started within 3ms of each other, the third queued
  ~1983ms behind them, matching the concurrency limit). Live HTTP test
  against the real server (:3000, real Postgres data): three distinct real
  unplayed non-friendly fixtures kicked off via `kickoffNew` - two of them
  concurrently (~2.4s wall time for both together, not serialized) - all
  three returned HTTP 200 with correct, non-cross-contaminated scores and
  team identities (confirmed by comparing each result's title/team ids
  against its own fixture, not another one running at the same time).

## Milestone 10 - Spatial Analysis Services

**Status:** Done (2026-09-06)

**Purpose:** Move geometry and space-reading behavior into reusable services instead of burying it in player decisions.

**Target Structure**

```text
src/simulation/spatial/
  SpatialAnalyzer.ts
  PassingAnalyzer.ts
  PressureAnalyzer.ts
```

**Tasks**

- [x] Move pressure counting into `PressureAnalyzer` - `getPressure`/
      `getPressuringOpponents`, verbatim formula out of `Decider.
  countPressure()`.
- [x] Move pass-lane geometry into `PassingAnalyzer` - `getPassingLane`,
      verbatim formula out of `Decider.laneIsClear()`, generalized to take
      plain coordinates instead of two `IFieldPlayer`s (nothing in the
      formula needed the player objects) and to return the blocking
      opponents alongside the boolean, for Milestone 13's future benefit.
- [x] Add nearest teammate/opponent helpers - `getNearestTeammates`/
      `getNearestOpponent` in `SpatialAnalyzer`.
- [x] Add goal distance and angle helpers - `getGoalDistance`/
      `getGoalAngle` (shot angle in degrees off the direct strike line;
      0 = level with the post along the attacking axis, 90 = out level
      with the goal line itself - meaningful given the goal is modelled as
      a single point, see `MatchSide.ScoringSide`).
- [x] Add open-space and space-ahead helpers - `getOpenSpace` (distance to
      nearest opponent) and `getSpaceAhead` (opponents contesting the
      corridor from a player towards his own scoring post, capped to a
      short lookahead distance).
- [x] Add defensive-line and team-compactness helpers - `getDefensiveLine`
      (average defender distance from own goal, orientation-agnostic) and
      `getTeamCompactness` (average pairwise distance between active
      outfield players).

**Revision note:** The tracker's own task list splits into two groups with
different risk profiles, handled differently: `countPressure`/
`laneIsClear` were **relocations** of formulas `Decider.ts` already had
verbatim (deterministic pure geometry, no randomness involved, so unlike
Milestone 8's resolver extraction there was no random-draw-ordering risk to
manage) - both call sites in `Decider.ts` now delegate to the new
functions instead of holding their own copy. The other four (nearest-
opponent, goal angle, open space/space-ahead, defensive line/compactness)
are genuinely **new** capabilities with no live caller yet - same
"infrastructure for a future caller" shape as Milestone 6's transition
validation. Feeding them into `TeamIntent`/`PlayerPolicy` is explicitly
later milestones' job (11's phases, 12's formation shape, 13's passing-
option scoring) - inventing a caller here would be scope creep, the same
call Milestone 7 made for `mentality`/`focus`/`risk`/`phase`.

**Where the actual duplication got fixed:** Milestone 7's `ObservationBuilder`
had a documented, deliberate near-term duplication - it recomputed its own
inline "opponents within radius"/"3 closest teammates" logic separately
from `Decider`'s private methods, flagged at the time as "Milestone 10's
job". This pass is what actually closes that gap:
`ObservationBuilder.buildObservation()` now calls `getPressuringOpponents`/
`getNearestTeammates`/`getGoalDistance` - the exact same functions
`Decider.countPressure()`/`passability()` call - so decision-making
(`Decider`, wrapped by `RuleBasedPlayerPolicy`) and observation-building
(`ObservationBuilder`, feeding `PlayerPolicy`) can no longer quietly drift
into two different answers for the same spatial question. This is also
the concrete realization of this milestone's first acceptance criterion -
the player-policy path asks a spatial service instead of doing the
geometry itself.

**Verified live:** `tsc --noEmit` clean; `oxlint src` clean; a dedicated
throwaway script (deleted after use, same pattern as Milestone 6/9's) built
a real `Game` from the checked-in DB-free roster pool and exercised every
new/moved helper against live match state at kickoff and again after
`game.advanceMatch({minute:20})` - all invariants held (angle in [0,90],
non-negative distances/counts, nearest-teammates sorted ascending, lane
`clear` matches `blockers.length`, etc.) and `getTeamCompactness` measurably
changed between the two snapshots, proving it reads live state rather than
a frozen one. `simRealismCheck.ts --compare` against a pre-milestone
baseline (957 vs 965 matches) - every metric within the same unseeded-
sampling noise band as every prior milestone, confirming the `countPressure`/
`laneIsClear` relocation and the `ObservationBuilder` rewire changed zero
gameplay behavior. Real HTTP `GET /api/game/kickoff-new/:fixture` against a
genuine unplayed, non-friendly fixture (looked up live via `GET
/api/fixtures?played=false`) - 200 OK, correct score/team identities,
standings updated.

**Acceptance Criteria**

- [x] Player policy asks spatial services for context instead of doing
      geometry directly - `ObservationBuilder` (which feeds
      `RuleBasedPlayerPolicy`) now calls `PressureAnalyzer`/
      `SpatialAnalyzer` instead of its own inline geometry.
- [x] Passing, shooting, pressing, and movement can share the same spatial
      facts - `Decider` (shooting/passing decisions) and `ObservationBuilder`
      now read pressure/nearest-teammate/lane facts from one shared source;
      `Actions.ts`'s pressing/movement code (`pressureBall`/`holdShape`)
      wasn't rewired this pass (no formula there was listed in this
      milestone's task list to move), but can pull from the same
      `spatial/` module going forward without duplicating geometry again.
- [x] Existing match outcomes remain broadly within baseline ranges after
      extraction - confirmed by the `simRealismCheck.ts --compare` run
      above.

## Milestone 11 - Possession And Match Phases

**Status:** Done (2026-09-07)

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

- [x] Add `PossessionState.sequenceId` - `state/MatchState.ts`, populated
      from `Match.getPossessionContext()` at snapshot time.
- [x] Track possession start/end - new `possession/PossessionTracker.ts`,
      owned by `Match` (`Match.Possession`, mirrors how `Match` already
      owns `Details`/`Events`).
- [x] Assign each event to a possession sequence - every `IMatchEvent` now
      carries `possessionSequenceId`/`phase`, stamped centrally by the
      `-event` listener in `Match.ts` (the same single chokepoint every
      event already flowed through per Milestone 6's own note).
- [x] Add phase transitions for restarts, buildup, progression,
      final-third, chances, counters, and defensive shape - new
      `possession/MatchPhase.ts` (`getAttackingPhase`/`getDefendingPhase`).
- [x] Feed phase into `TeamIntent` - `TeamIntent.phase`, computed by
      `TeamController.determineIntent()`, which now takes a real
      possession-context argument instead of ignoring `opponent`.
- [x] Record possession duration metrics - `PossessionTracker.
  getCompletedSequences()`; surfaced as two new diagnostic columns in
      `simRealismCheck.ts` ("Possession sequences per match", "Avg
      possession sequence length, mins").

**Design notes**

`PossessionTracker` operates on `Match.getCurrentTime` (minutes), not raw
ticks - `Actions.takeAction()` never needed to thread a tick index through
the call chain this way, since the tick-to-minute mapping already existed
everywhere it needed to ask "how long has this sequence been running".
A sequence starts when either (a) `Referee.markRestart()` was called ahead
of this tick (kickoff, half-time, post-goal, post-ball-out, penalty/
free-kick - both of `Referee`'s two existing restart chokepoints,
`handleMatchRestart()` and `setUpSetPiece()`, call it once each) or (b) the
side holding the ball this tick differs from last tick (an in-play
turnover the tracker detects on its own, no new call site needed).

`chance` is deliberately never returned by `getAttackingPhase`/
`getDefendingPhase` - whether a possession produced "a real chance" is only
knowable once a shot has actually happened, not before it. It's assigned
retroactively instead: the `-event` listener overrides the live phase to
`'chance'` for `goal`/`miss`/`save` events specifically, regardless of what
phase was live when the shot was decided.

`getAttackingPhase`/`getDefendingPhase` are pure functions of `(side,
opponent, context)` - `getDefendingPhase` internally calls
`getAttackingPhase(opponent, side, context)` to read what the opponent (who
has the ball) is doing, rather than needing the caller to compute and pass
that in a particular order. `counter` (Milestone 10's `getDefensiveLine`
applied to a real caller for the first time) fires when a side wins the
ball back and the opponent's back line is pushed more than half the
pitch's length from their own goal - genuinely reusing a Milestone 10
helper that had no live caller until now, exactly as that milestone's own
notes anticipated.

**The one real behavior change this milestone makes** (`Actions.
continueGamePlay()`): previously `pushForward(attackingSide)` ran
unconditionally every tick (100%) and the defending side's press-vs-drop-
off choice was a flat 50/50 regardless of situation. Both are now
phase-weighted rolls (`ATTACK_PUSH_CHANCE`/`DEFEND_PRESS_CHANCE` in
`Actions.ts`) - attackers hold shape more often during `build-up`/
`progression` instead of everyone bombing forward from their own third;
defenders press harder during `press`/`defensive-transition`, drop into
`defensive-shape` more readily otherwise. Tuned deliberately conservatively
(build-up/progression still push forward 80-90% of the time, not a hard
switch) after an initial pass showed a larger, unwanted dip in
shots-per-team and passes-per-team - both metrics `simRealismCheck.ts`
already flags as under real-world range; a phase-driven change shouldn't
make an already-weak metric worse. The final tuning keeps shots/shots-on-
target within normal unseeded-sampling noise of the pre-milestone baseline
while tackles/fouls/yellow-cards (all three _also_ previously under range)
move measurably _toward_ their real-world bands - a genuine side effect of
more realistic pressing, not the goal of the change but a welcome one.
Dribbles moved from comfortably-in-range (18.4) to barely-over (20.6) - the
one metric that got measurably worse, disclosed rather than chased away
(same spirit as Milestone 6's disclosed "+2/match events" shift).

**Verified live:** `tsc --noEmit` clean; `oxlint src` clean; a dedicated
throwaway script (deleted after use) ran 40 real roster-pool matches and
checked, over every event in every match: `possessionSequenceId`/`phase`
present on all of them, sequence ids never decrease within a match and
climb well past 1 per match (49 distinct ids across ~35 completed
matches), every phase value is one of the ten known enum values, and every
`goal`/`miss`/`save` event is tagged `'chance'` - all checks passed. Phase
distribution across ~2,800 tagged events was plausible and varied (not
stuck on one value): progression 50%, build-up 25%, final-third 8%,
attacking-transition 7%, restart 5%, chance 5%. `simRealismCheck.ts
--compare` against a pre-milestone baseline (965 vs 945 matches) - goals/
shots/shots-on-target/pass-completion/possession all within normal
unseeded-sampling noise; tackles/fouls/yellow-cards shifted measurably
toward their (already under-range) real-world bands; dribbles shifted
measurably past the top of its range (18.4 -> 20.6, disclosed above); the
two new diagnostic possession-duration metrics landed at plausible values
(≈32 sequences/match, ≈2.8 min average sequence length). Real HTTP `GET
/api/game/kickoff-new/:fixture` against a genuine unplayed, non-friendly
fixture (looked up live via `GET /api/fixtures?played=false`) - 200 OK,
correct score/standings, and the response's `Events` array itself carries
real `possessionSequenceId`/`phase` values end-to-end through the actual
running dev server (not just the offline scripts): sequence id climbing
0→1→2 across the match's first few turnovers, phases reading `'restart'`
(kickoff) then `'progression'`.

**Acceptance Criteria**

- [x] Event logs can explain which possession produced a shot/goal/turnover - every event's `possessionSequenceId` traces back to
      `PossessionTracker.getCompletedSequences()`.
- [x] Teams behave differently in buildup, transition, and final-third
      phases - `continueGamePlay()`'s push-forward/hold-shape and
      press/drop-off gates read `TeamIntent.phase` and change their odds
      accordingly (verified via the metric shifts above); final-third/
      chance also benefit from the engine's pre-existing distance-driven
      shoot thresholds (`Decider.tryShoot`/`isNearPost`), which already
      correlate with proximity to goal - not a new formula, but a real,
      pre-existing behavior difference these phases now correctly
      describe.
- [x] Possession changes are explicit state transitions - `PossessionTracker.
  update()` is called from inside the existing `applyPossessionChange`
      transition (Milestone 6), which now returns `{sequenceId,
  isNewSequence}` instead of `void`.

## Milestone 12 - Formation Anchors And Team Shape

**Status:** Done (2026-09-07)

**Purpose:** Make players move from a role/formation home position rather than simply chasing the ball or goal.

**Tasks**

- [x] Define normalized `FormationAnchor` - `state/PersistentState/
  Formations.ts`. This already existed as `FormationSlot`'s own x/y
      (0-1 fractions) - formalized as a named, reusable type
      (`FormationSlot extends FormationAnchor`) rather than a fresh
      concept, matching the pattern Milestone 7 found for `TeamIntent`/
      `IPlayingStyle`.
- [x] Map current formations to anchors - already true before this pass
      (`formationShapes` is exactly this mapping; `resolveFormation()`
      already resolves each anchor to a real block for the current
      grid/direction) - nothing to build, just recognize and name it.
- [x] Blend anchor, ball position, team intent, and role bias into a
      target position - `Actions.getShapeTarget()`, rewritten. "Anchor" is
      `FieldPlayer.StartingPosition` (each active player's own resolved
      `FormationAnchor`, kept current by `MatchSide.setFormation()`/
      `changeTactic()`); "team intent" is `team.Tactic.style` (the same
      source `TeamIntent` itself is a passthrough of, per Milestone 7's
      own note); "role bias" is `ROLE_SHAPE_BIAS`, keyed by the player's
      `Position` (`PlayerRole`/tendencies don't exist yet - that's
      Milestone 15's job, not invented early here).
- [x] Keep width and team shape during buildup/defending - `getShapeTarget()`
      now blends a Y-axis (width) pull toward the ball's flank, scaled by
      `team.Tactic.style.width`, alongside the existing X-axis (forward/
      back) pull - previously Y always stayed pinned to the anchor no
      matter what, so width had zero positioning effect.
- [x] Add shape behavior for high line, low block, compactness, and
      wide/narrow play - high line/low block was already real (`movePlayersForward`/
      `movePlayersBackward`'s `defensiveLineHeight`-scaled bias, pre-
      existing); wide/narrow is the new width blend above. "Compactness"
      wasn't given a separate dedicated mechanism - it already emerges
      from the same anchor+ball blend (everyone drifting toward the ball
      compresses the team without a second, competing force fighting it) -
      see the revision note below for why a distinct force wasn't added.

**Revision note - the real gap this milestone closed:** Investigation
before writing anything found the tracker's own framing ("blend anchor +
ball + intent + role into a target") was already ~70% true for ATT/MID
players (`getShapeTarget`'s x-only blend existed since Milestone 6-era
code) - but `pushForward`/`pushBackward`/`pressureBall` all filtered
through `getATTMID()`, which **only ever selects ATT/MID players**.
Defenders never received a single shape-holding movement call for the
entire match outside of being personally involved in a tackle/duel or a
half-time tactic change - they sat frozen at their exact kickoff block for
90 minutes. Renamed `getATTMID` to `getOutfield` (DEF/MID/ATT, GK still
excluded - goalkeepers stay on `Referee.ts`'s existing keeper-reset logic)
and swapped it into all four call sites - this, not the width blend, is
what actually makes "teams visibly keep shape" true for the whole team
rather than just its front two-thirds.

**Tuning note:** An initial pass (DEF role bias 0.5, width scale 0.5)
measurably suppressed shots/shots-on-target/goals in `simRealismCheck.ts`
beyond noise - a previously-inert defense actively holding/repositioning
made attacking harder, which is realistic in direction but landed on an
already under-real-world-range metric this project has been careful not
to worsen further (see Milestones 10/11's own tuning notes for the same
concern). Isolated via a WIDTH_DRIFT_SCALE=0 A/B: the width blend
contributed almost nothing to the dip: the DEF role bias did. Settled on
DEF 0.3 / MID 0.85 / ATT 1 and a width scale of 0.25, which brought shots/
shots-on-target/goals back to within normal unseeded-sampling noise of the
pre-milestone baseline while passes rose measurably (+1.8, a genuine
improvement against a metric that was also under range) and dribbles
eased back down slightly (toward, not away from, its own range).

**Verified live:** `tsc --noEmit` clean; `oxlint src` clean; a dedicated
throwaway script (deleted after use) confirmed, on a real roster-pool
match: at least one defender had moved off their exact kickoff block after
30 simulated minutes (previously impossible - zero would ever have moved);
no two outfield players ever share a block (no collapse); and, holding the
fixture/opponent/formation fixed and varying only the home side's style,
`Possession` (width 0.7) produced a measurably larger Y-axis spread among
home outfield players than `LowBlock` (width 0.5) after 60 minutes (4.55
vs 4.46 stddev) - all checks passed. `simRealismCheck.ts --compare`
against a pre-milestone baseline (945 vs 940 matches, after the tuning
pass above) - goals/shots/shots-on-target/passes/fouls/yellow-cards all
within normal noise, tackles/interceptions/dribbles/events shifted modestly
(consistent with a genuinely more active, better-organized defense).
Real HTTP `GET /api/game/kickoff-new/:fixture` against a genuine unplayed,
non-friendly fixture (looked up live via `GET /api/fixtures?played=false`)

- 200 OK against the actual running dev server.

**Acceptance Criteria**

- [x] Teams visibly keep shape in replay frames - defenders now actually
      move to hold/advance their own anchor-relative shape instead of
      standing frozen at kickoff all match.
- [x] Players do not collapse onto one shared destination - verified live
      (no two outfield players share a block after 30 minutes of play);
      structurally guaranteed too, since every player blends toward the
      ball/goal from their OWN anchor, not a single shared point.
- [x] Tactical width and defensive line affect positioning - width:
      verified live (4.55 vs 4.46 Y-spread, `Possession` vs `LowBlock`);
      defensive line: pre-existing `defensiveLineHeight`-scaled bias in
      `movePlayersForward`/`movePlayersBackward`, now actually reaching
      defenders too (previously only ATT/MID).

## Milestone 13 - Passing Options And Decision Evaluation

**Status:** Done (2026-09-07)

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

- [x] Generate candidate short, long, backward, through, and wide pass options
      - new `simulation/passing/PassingOption.ts`, `generatePassingOptions()`.
      Classified from real passer/receiver geometry (`classifyPassType()`),
      not five hand-rolled boolean checks - reuses Milestone 10's
      `getGoalDistance` for forward-progress and lateral-offset math.
- [x] Score each pass by retention, progress, threat, receiver pressure,
      and lane risk - `PassingOption` carries all of the tracker's own
      sketch fields (plus `passType`/`position`, needed to actually
      classify/filter candidates) - `laneRisk` reuses Milestone 10's
      `getPassingLane`, `receiverPressure` reuses Milestone 10's
      `getPressure` (both had zero live callers until now - exactly the
      "infrastructure for a future caller" both milestones anticipated).
- [x] Let team intent adjust pass scoring - `scorePassingOption()` weights
      retention/threat/risk by `team.Tactic.style.directness`.
- [x] Separate pass selection from pass execution success -
      `selectBestPass()` picks the top-scored candidate deterministically
      (choosing *probabilistically* among scored options is explicitly
      Milestone 18's job, not built early here); `PassResolver`'s actual
      success/failure dice roll is untouched by this milestone - see the
      revision note below for the one real formula gap this exposed.
- [x] Add metrics for pass type distribution and completion by type -
      `IPass.passType` threaded through `-pass-made`/`-pass-intercepted`
      into `IMatchEvent.data.passType` (the event's `data` field existed
      since Milestone 1-era code but nothing had ever actually populated
      it - `createMatchEvent()` never even accepted a `data` param before
      this pass); `simRealismCheck.ts` gained a new "Direct pass share %"
      diagnostic from it.

**Revision note - the real formula gap this exposed:** `PassResolver`'s
switch only ever handled `'short'`/`'long'` - any other type string
(including the pre-existing `'pass to post'`) fell to `default: break`,
leaving its `result` at the initial `true` and skipping the dice roll
entirely. Harmless while `'pass to post'` was the only such type (a
deliberate near-certain backpass), but Milestone 13's three new candidate-
scored types would otherwise have been 100%-guaranteed-success by
accident - a through ball must not be risk-free. Added real `'backward'`/
`'through'`/`'wide'` formulas to `PassResolver`, each a variation on the
existing `getResult()`-based `'short'`/`'long'` formulas (same mechanism,
adjusted weights) rather than new physics: `'backward'` safer than
`'short'`, `'through'` riskier than `'long'`, `'wide'` in between.

**A real receiver-targeting gap, closed:** `IStrategy`/`PlayerIntent`
gained a real `target`/`targetId` field - Milestone 7's own note on
`PlayerIntent` said giving it a real target needed candidate-receiver
scoring, "that's Milestone 13's job" - this is that. `Actions.pass()`
resolves `targetId` directly when present, falling back to its
pre-existing type-based lookups exactly as before for the paths that
still don't produce one (`keeperPass`, the near-post backpass special
case, and two unrelated "escape a tight mark" fallback callers elsewhere
in the class).

**Tuning notes:** Two real, load-bearing findings while tuning against
`simRealismCheck.ts`, not just constant-nudging: (1) candidates were
initially generated from only the 3 nearest teammates (reusing Milestone
10's `getNearestTeammates`) - this silently starved `style.directness` of
anything to actually select toward, since a genuine long-ball/through-ball
option is by definition further away than "nearest 3" and was almost never
in the pool. Switched to scoring every active outfield teammate (~10
players, cheap) - confirmed live this is what actually let a Direct-style
tactic's scoring weights produce a measurably different pass mix.
(2) Widening the candidate pool this way also made the decision genuinely
better at finding real attacking passes, which nearly doubled goals/shots
in one pass (correct direction, overshot the top of `simRealismCheck.ts`'s
real-world goals band) - raising `MIN_PASS_SCORE` (the minimum score worth
attempting at all, below which the strategy falls back to 'move') from
0.05 to 0.2 brought goals/shots back to a healthy position within range
without giving back most of the passes/shots gains.

**Verified live:** `tsc --noEmit` clean; `oxlint src` clean; a dedicated
throwaway script (deleted after use) confirmed, across 30 real roster-pool
matches: every `pass`/`interception` event carries a known `passType`, and
at least 4 of the 5 scored shapes actually occur (6 including `'pass to
post'`) with a plausible, non-degenerate distribution; a 25-run-each A/B
(same fixture/opponent/formation, only the home side's style varied
between `Direct` and `Possession`) confirmed all three acceptance
criteria with a real margin, not noise: `Direct` produced a higher
direct-pass share (35.5% vs 31.5%), `Possession` produced higher pass
completion (75.9% vs 69.9%) and longer average possession sequences
(2.21 vs 2.08 min). `simRealismCheck.ts --compare` against a pre-milestone
baseline (940 vs 952 matches) - goals/shots/shots-on-target/tackles all
improved measurably (goals +1.2 to 4.0, still comfortably inside [1.5,
4.5]; shots +1.3; tackles +0.3, all moving *toward* their real-world
bands, not away), pass completion/fouls/yellow-cards/red-cards within
noise, passes-per-team/dribbles/interceptions eased down slightly (still
within their own ranges) as a side effect of the engine now finding
better passes and attempting fewer bad ones. Real HTTP `GET
/api/game/kickoff-new/:fixture` against a genuine unplayed, non-friendly
fixture - 200 OK against the actual running dev server.

**Acceptance Criteria**

- [x] A player can choose a specific receiver and pass type - `Decider.
      whatKindaPass()`/`chanceToMoveForward()` now return a real `target`
      (receiver id) alongside the scored `passType`, flowing through
      `PlayerIntent.targetId` to `Actions.pass()`.
- [x] Riskier tactics produce more direct passes and more turnovers -
      verified live (35.5% vs 31.5% direct-pass share, `Direct` vs
      `Possession`; lower completion is the turnover side of the same
      measurement).
- [x] Safer tactics produce higher retention and longer possessions -
      verified live (75.9% vs 69.9% completion, 2.21 vs 2.08 min average
      possession sequence length).

## Milestone 14 - Off-Ball Behavior

**Status:** Done (2026-09-07)

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

- [x] Add `decideWithBall()` - already existed: the plan doc's own
      diagnosis is that `Decider.makeDecision()` only ever runs real logic
      when `player.WithBall` - it already *is* `decideWithBall()` in
      substance, so nothing needed renaming or duplicating.
- [x] Add `decideWithoutBall()` - the real, substantive new capability:
      new `player/OffBallPolicy.ts`, `decideAttackingOffBallIntent()`/
      `decideDefensiveIntent()`/`planDefensiveAssignments()`. Off-ball
      players (everyone except the ball carrier and the single nearest
      defender, every tick) previously had zero individual decision-making
      at all - the whole non-carrier side moved as one homogeneous blob
      under a single shared bias (Milestone 11/12's push-forward-vs-
      hold-shape roll and `getShapeTarget`, applied team-wide).
- [x] Add attacking off-ball support and run logic - all 8 intents
      implemented with real, distinct target formulas in `Actions.
      resolveAttackingOffBallTarget()` (reusing Milestone 12's
      `getShapeTarget` primitive with a different (destination, bias,
      lateralReference) tuple per intent, not 8 bespoke geometric
      routines).
- [x] Add defensive marking, covering, pressing, and lane blocking - all
      7 intents implemented; `'block-lane'`/`'mark'` target a live point
      directly (an opponent, a lane midpoint) rather than blending off an
      anchor.
- [x] Make passing options depend on off-ball movement - genuinely
      bidirectional, not just wiring one milestone's output into the
      other's input: (a) `PassingOption.receiverPressure`/
      `expectedRetention`/`expectedThreat` already read live teammate
      `BlockPosition`, so better off-ball positioning (a successful
      `'make-run'`/`'overlap'` into space) automatically improves that
      teammate's scored options next tick - structural, not a new call;
      (b) `planDefensiveAssignments()`'s `'block-lane'` reuses Milestone
      13's own `generatePassingOptions()`/`selectBestPass()` run from the
      ATTACKING side's perspective - "the pass the attack is most likely
      to make right now" is exactly the lane worth a defender standing in,
      closing the loop the other direction too.

**Revision note - a real, load-bearing bug found while tuning:**
`continueGamePlay()` called `this.move(defendingPlayer, 'towards ball',
...)` explicitly, then separately looped every other outfield defender
through `decideDefensiveIntent()`. Excluding `defendingPlayer` from that
second loop (the "obviously correct" version - a player already moved
once shouldn't also be re-decided) turned out to be a real regression: the
pre-existing pre-Milestone-14 `pressureBall()`/`markBall()` never excluded
that same nearest defender from its own presser selection either - being
already the closest to the ball, they were *always* both explicitly moved
toward it AND independently selected as a presser, moving twice in the
same tick. That accidental double-speed was, it turns out, load-bearing:
excluding it measurably hurt shots/goals and nearly doubled the "Dribbles
(successful)" diagnostic past the top of its real-world band (a slower-
closing primary marker leaves the ball carrier loosely marked for longer,
extending contested-dribble ticks instead of resolving them via a timely
tackle attempt). Fixed by keeping the double move (an explicit second
`'press'` move) while still excluding `defendingPlayer` from the
mark/block-lane/cover/hold-line assignment pool, so they stay dedicated to
engaging the ball rather than being pulled into a different duty
elsewhere - confirmed via an isolated live A/B, not guessed.

**Tuning notes:** An initial attacking-intent pass (`'attack-box'`
targeting the single exact `ScoringSide` point as BOTH destination and
lateral reference) collapsed every arriving attacker onto the same spot in
front of goal - exactly the "players collapse onto one shared destination"
failure Milestone 12 was built to prevent, and it congested the box
instead of creating chances in it. Fixed by narrowing only halfway toward
the goal-mouth from each player's own anchor instead of the single shared
point. Marking was also initially unbounded (every opposing ATT/MID got a
dedicated marker) - capped to the 2 most dangerous (closest-to-goal)
threats, both because man-marking an entire opposing midfield/attack
simultaneously isn't realistic and because it packed 1v1 duels across the
whole pitch at once rather than where they matter.

**Verified live:** `tsc --noEmit` clean; `oxlint src` clean; a dedicated
throwaway script (deleted after use) sampled live intent decisions across
25 real roster-pool matches at 8 points each: all 8 attacking intents and
5 of 7 defensive intents occurred with a plausible distribution (`'press'`/
`'track-run'` weren't exercised by this particular sampling harness, which
doesn't replicate the full press-selection roll - both are exercised by
the real match loop, confirmed separately via the `simRealismCheck.ts`
metric shifts below); off-ball attackers stayed meaningfully spread out
relative to the ball in 170/170 sampled ticks (never collapsed); of 170
`'block-lane'` assignments, 140 (82%) had the assigned defender end up
within 6 blocks of the actual lane midpoint they were assigned to block -
confirming the mechanism does what it claims, not just tags a label.
`simRealismCheck.ts --compare` against a pre-milestone baseline (952 vs
946 matches, after the double-move fix and tuning above) - every metric
within the same noise band as prior milestones' accepted tuning passes
(goals -0.4 still comfortably inside [1.5,4.5]; shots -0.7; dribbles -0.4,
essentially flat and still solidly in range after the earlier near-
doubling was fixed; tackles/interceptions/fouls/yellow-cards all within a
point of baseline). Real HTTP `GET /api/game/kickoff-new/:fixture` against
a genuine unplayed, non-friendly fixture - 200 OK against the actual
running dev server.

**Acceptance Criteria**

- [x] Receivers move into space before passes happen - `'make-run'`/
      `'move-between-lines'` are only assigned when Milestone 10's
      `getSpaceAhead`/`getPressure` confirm the space is actually open,
      and the resulting position feeds directly into Milestone 13's
      passing-option scoring next tick (see the bidirectional dependency
      above).
- [x] Defenders can deny passing lanes without always tackling -
      `'block-lane'` positions a defender on the threatened lane; verified
      live it's not a majority of defensive actions (170 block-lane vs
      1681 total sampled defensive decisions) and never itself attempts a
      tackle - it's pure positioning, same as `'mark'`/`'cover'`/
      `'hold-line'`/`'drop'`.
- [x] Match replays show coordinated movement away from the ball -
      verified live (spread-check above); each off-ball player now drifts
      toward a target shaped by their own individual intent rather than
      the whole side sharing one destination.

## Milestone 15 - Player Roles And Tendencies

**Status:** Done (2026-09-07)

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

- [x] Define `PlayerRole` - new `simulation/player/PlayerRole.ts`, the
      tracker's own 15 values, unchanged.
- [x] Define `PlayerTendencies` - `{width, directness, dribbling,
      shooting, pressing, discipline}`, deliberately the same vocabulary/
      0-1 scale as `IPlayingStyle` (team tactics) where the concept
      overlaps, so role tendencies and team tactics blend on one scale
      rather than needing translation between two.
- [x] Implement reasonable tendencies for each role - `ROLE_TENDENCIES`,
      hand-tuned constants (same treatment as `PLAYING_STYLES` in
      `Formations.ts`) - e.g. `winger.width=0.9`/`dribbling=0.8` vs
      `inside-forward.width=0.4`/`dribbling=0.7`; `poacher.shooting=0.9`
      vs `false-nine.shooting=0.55`.
- [x] Add role defaults for width, directness, dribbling, shooting,
      pressing, and discipline - all six, per role, in `ROLE_TENDENCIES`.
- [x] Allow player attributes, personality/tendencies to modify role
      defaults - `deriveTendencies()` nudges each tendency by the
      attribute that actually describes it (`Dribbling` for dribbling,
      `Shooting`+`Positioning` for shooting, `Aggression` for pressing/
      discipline, `LongPass`-vs-`ShortPass` for directness), same small
      `(attribute-50)/scale` nudge pattern `Decider.confidenceThreshold()`
      already used for composure/pressure.
- [x] Feed role and tendencies into `PlayerPolicy` - `PlayerPolicy.decide()`
      gained a `tendencies` parameter, computed in `Actions.takeAction()`
      alongside `observation`/`teamIntent` (same pattern Milestone 7 set),
      and genuinely consumed - see below, not just plumbed through unread.

**A real, pre-existing foundation found before writing anything:** every
player already carries a squad `Role` (`LW`/`RW`/`ST`/`CB`/... -
`controllers/players/player.model.ts`) separate from the coarse `Position`
(`GK`/`DEF`/`MID`/`ATT`) the simulation engine branches on everywhere -
randomly assigned but Position-consistent at generation, carried onto
every live `FieldPlayer` (`Player.ts`'s constructor already copies it),
and confirmed completely unused inside `src/simulation/` before this
milestone. `PlayerRole` (this milestone's 15 tactical roles) is derived
from that existing squad `Role` *plus* attributes - deliberately not a
new persisted field. Two players sharing the exact same squad `Role`
(e.g. `CB`) resolve to different `PlayerRole`s when their attributes
actually differ (a passing-heavy `CB` -> `ball-playing-defender`, a
tackling-heavy one -> `centre-back`) - verified live, not just asserted.

**Where tendencies actually change behavior (not just infrastructure):**

- **Shooting** (`Decider.chanceToShoot()`) - a player's own `shooting`
  tendency shifts their shot-attempt confidence threshold, separately
  from the shared `confidenceThreshold()` helper (which also drives the
  pass-vs-move roll and shouldn't inherit a shooting-only bias).
- **Pass selection** (`Decider.whatKindaPass()`/`chanceToMoveForward()`) -
  two new things, both real: `minPassScoreFor()` shifts each player's own
  effective `MIN_PASS_SCORE` bar by their `dribbling` tendency (a winger
  holds out for a better pass before taking it, happy to dribble instead;
  a deep-playmaker passes more readily even at a mediocre score);
  `blendedPassingStyle()` averages the player's own `directness` tendency
  with the team tactic's `style.directness` before scoring candidates, so
  a direct-tactic team still plays a deep-playmaker's passes safer than a
  winger's under the identical tactic.
- **Off-ball width** (`Actions.applyWidthTendency()`) - nudges Milestone
  14's `'overlap'`/`'underlap'`/`'hold-width'`/`'make-run'` targets
  further toward this player's own natural flank (high `width`) or back
  toward centre (low `width`), on top of whatever team tactic width
  already produced.
- **Pressing selection** (`Actions.continueGamePlay()`'s presser sort) -
  a high-`pressing` defender effectively "counts as closer" to the ball
  than their raw distance, and a low-`pressing` one effectively counts as
  further - the eager presser a step further away gets picked over the
  reluctant one a step closer.

**Verified live:** `tsc --noEmit` clean; `oxlint src` clean; a dedicated
throwaway script (deleted after use) confirmed: the same squad `Role`
(`CB`, and separately `ST`) resolves to different `PlayerRole`s purely
from attribute differences (`ball-playing-defender` vs `centre-back`;
`poacher`/`target-forward`/`false-nine`, all three); two players with an
*identical* role but different `Positioning` attribute get measurably
different shooting tendencies (confirming the attribute modifier is a
real nudge, not a no-op); the role tendency table itself has real,
intentional spread (poacher vs false-nine shooting, winger vs inside-
forward width); and, across ~870+104 sampled touches from 60 real roster-
pool matches, ATT players in the top half of observed shooting tendency
shot measurably more often per touch than those in the bottom half
(38.8% vs 31.7%) - the actual behavioral acceptance criterion, not just
the lookup table. `simRealismCheck.ts --compare` against a pre-milestone
baseline (946 vs 963 matches) - every metric within normal unseeded-
sampling noise, goals/shots/shots-on-target nudged slightly further
toward their real-world bands; no tuning pass was needed this time (the
individual per-player swings are small enough, and average out across a
roster of mostly-middling tendencies, that the aggregate baseline barely
moved). Real HTTP `GET /api/game/kickoff-new/:fixture` against a genuine
unplayed, non-friendly fixture - 200 OK against the actual running dev
server.

**Acceptance Criteria**

- [x] Two players with the same position can choose noticeably different
      actions - verified live (shooting-tendency correlation above); also
      structurally true for pass selection (`dribbling`/`directness`
      tendencies) and off-ball width, all keyed off the SAME `Position`.
- [x] Role affects off-ball movement and on-ball choices - width
      (movement) and shooting/dribbling/directness (on-ball) are both
      real, live-verified wiring points, not one or the other.
- [x] Tactics, role, ability, and tendencies combine instead of relying on
      only `GK/DEF/MID/ATT` - `blendedPassingStyle()` is the clearest
      single example: team tactic (`IPlayingStyle.directness`) and player
      tendency (`PlayerTendencies.directness`, itself role default +
      attribute nudge) are averaged into one score, not either one alone.

## Milestone 16 - Simultaneous Intentions And Tick Loop

**Status:** Done (2026-09-07) - revised scope, see note below

**Purpose:** Move from sequential player scripting toward snapshot-based decisions and resolved conflicts.

**Revision note - what this engine's tick model actually needed:** The
plan doc's own Phase 11 sketch (`intentions = players.map(decide); resolver.
resolve(intentions, world)`) describes N players simultaneously deciding
POTENTIALLY-CONFLICTING ON-BALL actions (pass/press/intercept) from one
snapshot. That isn't this engine's actual shape and was never going to be
without a much larger rewrite: exactly ONE real on-ball decision happens
per tick (`Decider.makeDecision()`, for whoever currently holds the ball -
established since Milestone 1), and nothing mutates before it runs, so it
was ALREADY snapshot-consistent by construction - confirmed by inspection,
not assumed. The real, live version of "sequential scripting resolving
conflicts by loop order" was found elsewhere: `Actions.continueGamePlay()`'s
off-ball movement (Milestone 14) decided-and-moved each player in the same
step, in raw `getOutfield()` array order - whichever player was enumerated
first silently won any contested free block (`checkNextBlocks()`/
`findFreeBlock()` read LIVE occupancy, which changes as earlier players in
the SAME loop move). That's the actual problem this milestone fixes.

**Tasks**

- [x] Define simulation tick length - formalized, not newly invented: new
      `simulation/utils/matchClock.ts` (`TICKS_PER_MINUTE`/`HALF_TIME_TICK`/
      `FULL_TIME_TICK`/`MATCH_DURATION_MINUTES`), replacing a bare `/2`/
      `*2`/`90`/`180` that was independently scattered across `Game.ts`'s
      tick loop and `Match.captureFrame()`'s replay-frame half number. A
      finer, sub-second tick (the plan doc's own alternative sketch) was
      considered and deliberately NOT adopted - every formula tuned since
      Milestone 1 is calibrated against this exact 2-ticks-per-minute
      cadence, and changing it would be the same class of blanket
      recalibration risk already flagged (and deferred) for the field
      grid's own resolution.
- [x] Build each tick from a stable state snapshot - already true for the
      one real on-ball decision each tick (see the revision note); now
      also true for off-ball movement - every off-ball player's intent
      AND target is computed from state nothing in that pass has touched
      yet (each other's target computation reads only `StartingPosition`/
      team posts/tactic/one `ballPosition` captured once - none of which
      change as a side effect of a SIBLING's target being computed,
      confirmed by inspection of `resolveAttackingOffBallTarget`/
      `resolveDefensiveOffBallTarget`).
- [x] Collect player intentions before mutating state -
      `Actions.continueGamePlay()` now builds a full `OffBallMove[]` plan
      (player + intent + target) for each side before any of them
      actually move, instead of deciding-and-moving one player at a time.
- [x] Resolve movement, passes, tackles, interceptions, and shots after
      intentions are collected - the off-ball movement plan is executed by
      a new `resolveOffBallMoves()`, in ball-distance order rather than
      collection/array order (see acceptance criteria below); pass/tackle/
      interception/shot resolution was already separated from decision-
      making back in Milestone 8 (Resolver Layer) - decision (`Decider`)
      and outcome (`PassResolver`/`TackleResolver`/`ShotResolver`) were
      already two distinct steps, nothing to redo there.
- [x] Record only meaningful public events while keeping enough internal
      tick data for debugging/replay - audited, not rebuilt: `Match.Events`
      (narrated pass/shot/goal/foul/etc, filtered by type) and
      `Match.Frames` (every tick's full player positions + events since
      the last frame, Milestone 1/3) already cleanly separate these two
      concerns, and Milestone 6 already deliberately kept the per-tick
      possession-credit call event-free specifically to avoid flooding
      `Events` with noise. Nothing needed changing here.

**Verified live:** `tsc --noEmit` clean; `oxlint src` clean; a dedicated
throwaway script (deleted after use) directly proved the resolver claim:
spied on `Actions.move()` around a real match's live kickoff players, fed
`resolveOffBallMoves()` a deliberately reversed-by-distance plan, and
confirmed the actual execution order was non-decreasing in ball-distance
regardless (kickoff naturally produced some exact distance ties from
formation symmetry - a stable sort's tie-break is allowed to go either
way, so the check verifies "correctly sorted", not "matches one specific
pre-computed tie-break"). `simRealismCheck.ts --compare` against a pre-
milestone baseline (963 vs 953 matches) - every metric within noise,
most within a rounding error of zero - expected and reassuring: this
refactor only changes resolution order for the rare case of genuine
off-ball block contention, not the underlying decision formulas, so a
near-zero aggregate shift is the correct signature of "the refactor
didn't change behavior, just made an existing edge case correct." Real
HTTP `GET /api/game/kickoff-new/:fixture` against a genuine unplayed,
non-friendly fixture - 200 OK against the actual running dev server.

**Acceptance Criteria**

- [x] Players decide from the same tick snapshot - true for the ball
      carrier since Milestone 1 (confirmed, not assumed); true for every
      off-ball player as of this milestone.
- [x] Conflicts are resolved by the resolver layer, not by loop order -
      verified live: `resolveOffBallMoves()`'s ball-distance ordering
      overrides array/collection order, confirmed with a reversed-order
      input.
- [x] Replay frames remain compatible with the current frontend -
      `IMatchFrame`'s shape is untouched by this milestone (only its
      internal `half` computation now reads a named constant instead of a
      bare `90`) - no field added, removed, or renamed.

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
