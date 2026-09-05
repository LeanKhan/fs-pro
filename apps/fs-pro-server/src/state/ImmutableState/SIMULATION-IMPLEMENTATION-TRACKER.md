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

**Status:** Not started

**Purpose:** Freeze current behavior with measurable output before changing architecture.

**Code Areas**

- `src/scripts/simRealismCheck.ts`
- `src/jobs/matchSimWorker.ts`
- `src/jobs/matchQueue.ts`
- `src/classes/Match.ts`
- `src/state/ImmutableState/Actions/Decider.ts`

**Tasks**

- [ ] Define `SimulationMetrics` shape.
- [ ] Add aggregate metrics for goals, shots, shots on target, passes, possession, fouls, cards, tackles, dribbles, and events.
- [ ] Add distribution buckets, not only averages.
- [ ] Save baseline output to `tmp/simulation-baseline.json`.
- [ ] Add a command for repeatable baseline runs.

**Acceptance Criteria**

- [ ] Can run at least 1,000 matches from the command line.
- [ ] Output includes both averages and distributions.
- [ ] Baseline file can be compared with a later run.

## Milestone 2 - Create Simulation Package Boundary

**Status:** Not started

**Purpose:** Move toward a package that receives plain data and returns plain simulation results.

**Target Structure**

```text
packages/simulation/
  src/
    simulateMatch.ts
    types.ts
```

**Tasks**

- [ ] Create `packages/simulation`.
- [ ] Define `SimulateMatchRequest`.
- [ ] Define `SimulateMatchResult`.
- [ ] Wrap the current TypeScript engine behind `simulateMatch()`.
- [ ] Ensure the package has no Express, Vue, Socket.IO, queue, or database imports.
- [ ] Update server code to call the package boundary.

**Acceptance Criteria**

- [ ] Simulation package can be imported by `fs-pro-server`.
- [ ] Existing match simulation still works through the current app flow.
- [ ] Package input/output is JSON-serializable.

## Milestone 3 - Introduce Match State

**Status:** Not started

**Purpose:** Make match progress resumable and inspectable.

**Target Structure**

```text
packages/simulation/src/state/
  MatchState.ts
  BallState.ts
  PossessionState.ts
  PlayerMatchState.ts
```

**Tasks**

- [ ] Define `MatchState`.
- [ ] Define `BallState`.
- [ ] Define `PossessionState`.
- [ ] Define `TeamMatchState`.
- [ ] Define `PlayerMatchState`.
- [ ] Add conversion from existing `Match`/`MatchSide` objects to `MatchState`.
- [ ] Add conversion from `MatchState` back to current result shape.

**Acceptance Criteria**

- [ ] A match state snapshot contains enough data to continue simulation.
- [ ] Player permanent attributes are separated from match-specific state.
- [ ] Ball possession has a single canonical owner.

## Milestone 4 - Seeded Randomness

**Status:** Not started

**Purpose:** Make simulation reproducible for debugging, regression checks, and future Go parity.

**Target Structure**

```text
packages/simulation/src/randomness/
  RandomSource.ts
  SeededRandom.ts
```

**Tasks**

- [ ] Define `RandomSource`.
- [ ] Add seeded RNG implementation.
- [ ] Thread RNG through new simulation package boundary.
- [ ] Replace simulation-path `Math.random()` calls incrementally.
- [ ] Preserve existing behavior as much as possible during the first pass.

**Acceptance Criteria**

- [ ] Same request plus same seed produces the same result.
- [ ] Baseline runner can run deterministic comparisons.

## Milestone 5 - Chunked Simulation

**Status:** Not started

**Purpose:** Allow matches to advance to natural stopping points for human/AI manager decisions.

**Target API**

```ts
advanceMatch(state, { until: { event: 'half-time' } });
advanceMatch(state, { until: { event: 'full-time' } });
advanceMatch(state, { until: { minute: 60 } });
advanceMatch(state, { until: { event: 'next-stoppage' } });
```

**Tasks**

- [ ] Define `AdvanceUntil`.
- [ ] Define `advanceMatch()`.
- [ ] Support half-time and full-time boundaries first.
- [ ] Store enough state to resume after a chunk.
- [ ] Add manager/game transition helpers.

**Acceptance Criteria**

- [ ] CPU-vs-CPU match can run first half, pause, then run second half.
- [ ] Match result is saved only after final state.
- [ ] Human and AI manager decisions can both apply through the same transition functions.

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
packages/simulation/src/team/
  TeamController.ts
  TeamIntent.ts

packages/simulation/src/player/
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
packages/simulation/src/resolver/
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
packages/simulation/src/spatial/
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
packages/simulation/src/config/
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
- [ ] What are acceptable baseline ranges for goals, shots, pass completion, fouls, and cards?
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
