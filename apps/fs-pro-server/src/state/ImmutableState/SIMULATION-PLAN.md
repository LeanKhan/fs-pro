Yes. I would treat this as an **evolution of the current simulator**, not a rewrite. Your `Decider` already contains useful domain logic for shooting, passing, pressure, lanes, tackling, dribbling, and tactical tempo, so the plan should progressively redistribute responsibilities around it rather than throw it away.

The target architecture is:

```text
Match Engine
    │
    ├── Match State
    │
    ├── Team Controller ───── decides team intent
    │       │
    │       └── Tactical State
    │
    ├── Player Policy ─────── decides each player's intention
    │       │
    │       ├── Ball actions
    │       └── Off-ball actions
    │
    ├── Intent Resolver ───── resolves simultaneous actions
    │
    ├── Movement / Spatial Engine
    │
    ├── Rules Engine
    │
    └── Event Recorder
             │
             └── future ML training data
```

## Phase 0 — Freeze the current simulator as a baseline

Before changing behaviour, establish a measurable baseline.

Your current match output includes goals, tackles, dribbles, misses, saves, and match events, but it is too sparse to explain _why_ those things happened.

Run perhaps 1,000–10,000 matches with the current engine and record aggregate statistics:

```ts
interface SimulationMetrics {
  matches: number;

  goalsPerMatch: number;
  shotsPerMatch: number;
  shotsOnTargetPerMatch: number;

  passesPerMatch: number;
  passCompletion: number;

  tacklesPerMatch: number;
  tackleSuccess: number;

  dribblesPerMatch: number;
  dribbleSuccess: number;

  possessionHome: number;
  possessionAway: number;

  eventsPerMinute: number;

  averagePossessionLength: number;
}
```

Also measure distribution, not just averages.

For example:

```text
Goals/match
0  ███
1  █████
2  █████████
3  ███████
4  ████
5+ ██
```

That becomes your regression benchmark.

Whenever you change the simulator, you can ask:

> Did this make football more realistic, or merely different?

---

# Phase 1 — Introduce a proper `MatchState`

At the moment, different pieces of information appear to live on players, sides, and the simulator itself.

Centralize the current state.

Something like:

```ts
interface MatchState {
  clock: MatchClock;

  score: {
    home: number;
    away: number;
  };

  ball: BallState;

  possession: PossessionState;

  phase: MatchPhase;

  players: Map<string, PlayerMatchState>;

  home: TeamMatchState;
  away: TeamMatchState;

  previousEvents: MatchEvent[];
}
```

And:

```ts
interface BallState {
  position: Coordinate;

  holderId?: string;

  state: 'controlled' | 'loose' | 'travelling' | 'out-of-play';
}
```

This becomes the canonical description of:

> What does the world look like right now?

Players should no longer have to own all world state themselves.

For example, `player.WithBall` can eventually become derived:

```ts
const withBall = state.ball.holderId === player.ID;
```

rather than duplicated state.

That avoids impossible situations such as two players accidentally having:

```ts
WithBall = true;
```

---

# Phase 2 — Make possession a first-class concept

This is probably the most important immediate simulation improvement.

Your current event stream can jump rather abruptly between:

```text
tackle
shot
save
goal
dribble
```

without an explicit concept of a possession developing.

Add:

```ts
interface PossessionState {
  teamId: string;

  playerId?: string;

  startedAt: number;

  sequenceId: string;

  phase:
    | 'restart'
    | 'build-up'
    | 'progression'
    | 'final-third'
    | 'chance'
    | 'transition';
}
```

Now events belong to possessions.

For example:

```text
POSSESSION 418

ZD recover ball
↓
build-up
↓
short pass
↓
short pass
↓
progression
↓
carry
↓
final third
↓
through ball
↓
shot
↓
save

POSSESSION END
```

This single change will make match behaviour much easier to reason about.

---

# Phase 3 — Separate team decisions from player decisions

Right now tactical information already affects individual choices. For example, your `confidenceThreshold()` uses:

```ts
attackingSide.Tactic.style.tempo;
```

to change player aggressiveness.

That's a useful beginning.

But introduce an explicit team policy.

Create:

```text
simulation/
    team/
        TeamController.ts
        TeamIntent.ts
        TeamPhase.ts
        TacticalEvaluator.ts
```

With:

```ts
interface TeamIntent {
  phase:
    | 'build-up'
    | 'progression'
    | 'final-third'
    | 'defending'
    | 'counter'
    | 'defensive-transition';

  mentality:
    | 'very-defensive'
    | 'defensive'
    | 'balanced'
    | 'attacking'
    | 'very-attacking';

  tempo: number;
  width: number;
  risk: number;

  pressing: number;
  defensiveLine: number;

  focus: 'left' | 'right' | 'center' | 'balanced';

  directness: number;
}
```

Then:

```ts
class TeamController {
  determineIntent(
    team: MatchSide,
    opponent: MatchSide,
    state: MatchState
  ): TeamIntent {}
}
```

This answers:

> What is the team trying to accomplish right now?

It does **not** choose individual actions.

---

# Phase 4 — Replace `Decider` conceptually with `PlayerPolicy`

You don't even need to rename it immediately.

Your current `Decider.makeDecision()` already behaves like a player policy because it receives a player and contextual information and selects an action.

Eventually change:

```ts
makeDecision(player, attackingSide, defendingSide);
```

into:

```ts
decide(
  player: PlayerMatchState,
  observation: PlayerObservation,
  teamIntent: TeamIntent,
  matchState: MatchState
): PlayerIntent
```

And broaden the return type substantially.

Currently:

```ts
type:
  | 'pass'
  | 'move'
  | 'shoot'
```

Eventually:

```ts
type PlayerIntent =
  | PassIntent
  | ShootIntent
  | CarryIntent
  | DribbleIntent
  | PressIntent
  | MarkIntent
  | TackleIntent
  | RunIntent
  | SupportIntent
  | HoldPositionIntent;
```

For example:

```ts
interface PassIntent {
  type: 'pass';

  targetId: string;

  passType: 'short' | 'long' | 'through' | 'cross' | 'backpass';

  targetPosition?: Coordinate;
}
```

Notice the important change.

Don't return:

```ts
{
  type: 'pass',
  detail: 'short'
}
```

Return:

```ts
{
  type: 'pass',
  passType: 'short',
  targetId: 'P000120'
}
```

The decision should contain the **actual intention**.

---

# Phase 5 — Introduce `PlayerObservation`

Don't let individual players see the entire simulation indiscriminately.

Give them an observation.

```ts
interface PlayerObservation {
  self: PlayerMatchState;

  ball: {
    position: Coordinate;
    distance: number;
    holder?: VisiblePlayer;
  };

  teammates: VisiblePlayer[];

  opponents: VisiblePlayer[];

  goal: {
    distance: number;
    angle: number;
  };

  pressure: number;

  passingOptions: PassingOption[];

  availableSpace: SpaceObservation[];
}
```

This creates an abstraction layer:

```text
World
  ↓
Observation builder
  ↓
Player
```

Why is this important?

Because someday:

```ts
RuleBasedPlayerPolicy;
```

can become:

```ts
NeuralPlayerPolicy;
```

without changing the match engine.

Both receive:

```ts
PlayerObservation;
```

and return:

```ts
PlayerIntent;
```

That interface is the seam where your future learned model goes.

---

# Phase 6 — Add proper passing-option evaluation

Your existing `passability()` is already heading in a useful direction: it checks several nearby teammates and uses actual pass-lane geometry rather than just distance.

Keep that work.

But change the question from:

> Can I pass?

to:

> What passes are available, and how good is each one?

Create:

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

Then:

```ts
getPassingOptions(
  player,
  state
): PassingOption[]
```

You can rank them:

```ts
score =
  expectedRetention * 0.35 +
  forwardProgress * 0.25 +
  expectedThreat * 0.25 -
  laneRisk * 0.15;
```

Don't worry about getting these weights perfect.

The important architectural change is:

```text
generate options
       ↓
evaluate options
       ↓
choose action
```

rather than:

```text
random threshold
       ↓
pass/move
```

Your current probability functions still determine execution success afterwards.

---

# Phase 7 — Separate decision quality from execution quality

This is extremely important.

Currently the player's attributes affect several outcome calculations, such as pass, dribble, tackle, and shot success.

You should explicitly separate:

```text
DECISION

Should I attempt the pass?
Should I shoot?
Should I dribble?

          ↓

EXECUTION

Did the pass succeed?
Did the shot hit the target?
Did the defender win the tackle?
```

These are different skills.

For example:

```text
Player A

Mental: 90
Passing: 55

chooses excellent passes
but doesn't always execute them
```

versus:

```text
Player B

Mental: 45
Passing: 90

technically brilliant
but frequently chooses bad options
```

Your `Mental` attribute can influence decision evaluation.

Technical attributes influence execution.

That will create much more meaningful player individuality.

---

# Phase 8 — Add off-ball behaviour

This is the biggest behavioural upgrade.

Right now much of `makeDecision()` only runs meaningful logic when:

```ts
player.WithBall;
```

is true.

Create separate policies:

```ts
decideWithBall(...)
```

and:

```ts
decideWithoutBall(...)
```

For attacking players:

```ts
type AttackingOffBallIntent =
  | 'support'
  | 'make-run'
  | 'overlap'
  | 'underlap'
  | 'hold-width'
  | 'move-between-lines'
  | 'attack-box'
  | 'drop-deep';
```

For defending:

```ts
type DefensiveIntent =
  | 'press'
  | 'mark'
  | 'cover'
  | 'track-run'
  | 'hold-line'
  | 'drop'
  | 'block-lane';
```

Now the simulator can produce the conditions that make passes possible.

Instead of:

```text
player searches for available receiver
```

you'll have:

```text
receiver deliberately moves into space

passer notices opening

pass happens
```

That's a huge difference.

---

# Phase 9 — Give players roles, not just positions

At present you primarily branch around:

```text
GK
DEF
MID
ATT
```

as seen throughout `makeDecision()`.

Keep position, but add role.

For example:

```ts
type PlayerRole =
  | 'goalkeeper'
  | 'sweeper-keeper'
  | 'centre-back'
  | 'ball-playing-defender'
  | 'full-back'
  | 'wing-back'
  | 'holding-midfielder'
  | 'deep-playmaker'
  | 'box-to-box'
  | 'attacking-midfielder'
  | 'winger'
  | 'inside-forward'
  | 'target-forward'
  | 'poacher'
  | 'false-nine';
```

Then:

```ts
role.behaviour;
```

controls tendencies.

A winger might have:

```ts
{
  widthBias: 0.9,
  dribbleBias: 0.8,
  crossBias: 0.75,
  centralRunBias: 0.2
}
```

An inside forward:

```ts
{
  widthBias: 0.4,
  dribbleBias: 0.7,
  crossBias: 0.3,
  centralRunBias: 0.9
}
```

Same `ATT` position.

Completely different behaviour.

---

# Phase 10 — Add personality/tendencies

This is another layer distinct from ability.

```ts
interface PlayerTendencies {
  risk: number;

  shootFrequency: number;

  dribbleFrequency: number;

  forwardPassPreference: number;

  aggression: number;

  creativity: number;

  positionalDiscipline: number;
}
```

So two players with:

```text
Shooting 80
Dribbling 80
Passing 80
```

still play differently.

This also reduces the need for hard-coded rules such as:

```ts
if (player.Position === 'ATT')
```

everywhere.

Eventually your decisions become more compositional:

```text
ability
+
role
+
personality
+
tactics
+
situation
=
behaviour
```

---

# Phase 11 — Add simultaneous intentions

This is the architectural step I would be particularly careful about.

Don't do:

```ts
for (const player of players) {
  player.act(world);
}
```

Instead:

```ts
const snapshot = world.snapshot();

const intentions = players.map((player) =>
  playerPolicy.decide(
    player,
    observationBuilder.for(player, snapshot),
    teamIntent[player.ClubCode],
    snapshot
  )
);

resolver.resolve(intentions, world);
```

Everyone chooses based on the same state.

Then the resolver determines conflicts.

For example:

```text
Player A → pass to B

Player B → move forward

Defender C → press A

Defender D → intercept lane
```

The resolver calculates what actually happens.

This is much closer to simulation than sequential scripting.

---

# Phase 12 — Introduce simulation ticks

Your existing match events are largely minute-based.

You don't need actual real-time simulation, but introduce a smaller simulation unit.

Maybe:

```text
1 tick = 1 simulated second
```

or:

```text
1 tick = 2 simulated seconds
```

You can still only record interesting events.

So:

```text
tick 1412
players reposition

tick 1413
players reposition

tick 1414
pass selected

tick 1415
ball travelling

tick 1416
receiver collects
```

But your public commentary only records:

```text
23:34 Rook passes to Mann
```

This separates:

```text
simulation frequency
```

from:

```text
event/commentary frequency
```

which is important.

---

# Phase 13 — Model the ball independently

Eventually the ball should be a world object rather than essentially an ownership flag.

```ts
interface BallState {
  position: Vector2;

  velocity: Vector2;

  holderId?: string;

  target?: Vector2;

  state: 'controlled' | 'passing' | 'shooting' | 'loose';
}
```

You don't need complex physics.

For a pass:

```text
start
destination
speed
arrival time
```

is sufficient.

Now interception can happen because:

```text
defender reaches ball trajectory
```

rather than simply because:

```text
interceptor selected
→ dice roll
```

Your existing `laneIsClear()` geometry is already an early version of this spatial reasoning.

---

# Phase 14 — Build a proper action resolver

Create:

```text
simulation/
    resolver/
        IntentResolver.ts
        PassResolver.ts
        ShotResolver.ts
        TackleResolver.ts
        MovementResolver.ts
        CollisionResolver.ts
```

The player says:

```text
I want to shoot.
```

The resolver decides:

```text
shot attempted
shot blocked
shot on target
saved
goal
```

Your existing functions:

```ts
getPassResult();
getDribbleResult();
getTackleResult();
getShotResult();
```

should migrate here.

This means `PlayerPolicy` contains **decision logic**.

Resolvers contain **outcome logic**.

That's an important separation.

---

# Phase 15 — Introduce match phases formally

Football behaves radically differently depending on phase.

I'd model at least:

```text
OWN POSSESSION
    build-up
    progression
    final-third
    chance

POSSESSION LOST
    defensive-transition

OPPOSITION POSSESSION
    defensive-shape
    press

POSSESSION WON
    attacking-transition
    counter
```

This becomes part of `TeamIntent`.

Example:

```ts
if (
  possessionJustWon &&
  opponentShape.disorganized &&
  team.Tactic.counterAttack > 0.7
) {
  phase = 'counter';
}
```

During a counter:

```text
players sprint forward
passes become more direct
risk increases
shape temporarily expands
```

During build-up:

```text
defenders spread
midfielder drops
tempo lower
short options preferred
```

Now football emerges from phase-dependent behaviour.

---

# Phase 16 — Add formation anchors

Each player needs a default location relative to the team shape.

For example:

```ts
interface FormationAnchor {
  x: number; // normalized 0–1
  y: number;
}
```

A 4-3-3 might approximately have:

```text
              ST

LW                         RW

        CM        CM

              DM

LB       CB        CB       RB

              GK
```

But the anchor moves according to ball position.

Something like:

```ts
targetPosition =
  formationAnchor + ballInfluence + teamIntentInfluence + roleInfluence;
```

Players don't literally stand at fixed coordinates.

Their formation is a **gravitational home position**.

---

# Phase 17 — Add spatial concepts

Create a small spatial-analysis service:

```text
SpatialAnalyzer
```

It should provide:

```ts
getPressure(player);

getNearestOpponent(player);

getNearestTeammates(player);

getOpenSpace(player);

getPassingLane(a, b);

getGoalAngle(player);

getDefensiveLine(team);

getTeamCompactness(team);

getLocalNumericalAdvantage(position);

getSpaceAhead(player);
```

Your current `countPressure()` and `laneIsClear()` can move into this service.

Then policies ask spatial questions rather than implementing geometry themselves.

---

# Phase 18 — Make decision-making score-based

Move away from chains like:

```ts
if (...) shoot
else if (...) move
else pass
```

toward:

```ts
const options = [
  evaluateShoot(...),
  evaluatePass(...),
  evaluateCarry(...),
  evaluateDribble(...)
];

return choose(options);
```

For example:

```ts
{
  action: {
    type: 'shoot'
  },

  utility: 0.62
}
```

versus:

```ts
{
  action: {
    type: 'pass',
    targetId: 'P10'
  },

  utility: 0.74
}
```

Then choose probabilistically.

For example:

```text
pass   0.74
shoot  0.62
carry  0.51
```

Don't always choose the maximum.

Maybe:

```text
pass   55%
shoot  30%
carry  15%
```

That gives variation without pure randomness.

This is extremely important for your future learned model because this policy becomes conceptually similar to:

$$
P(action|state)
$$

---

# Phase 19 — Replace magic thresholds gradually

You currently have values such as:

```ts
threshold: 90;
distance: 3;
```

and lots of `30`, `40`, `50`, etc.

That's okay today.

Don't try to eliminate them immediately.

Instead centralize them:

```ts
interface SimulationConfig {
  shooting: {...};
  passing: {...};
  pressing: {...};
  movement: {...};
}
```

Then eventually derive them from data.

You'll want:

```text
config/
    defaultSimulationConfig.ts
```

rather than constants scattered across the codebase.

---

# Phase 20 — Build a structured event system

The current match output stores mostly human-readable `message` alongside some metadata.

Flip that around.

Structured event first:

```ts
interface PassEvent {
  type: 'pass';

  tick: number;
  minute: number;

  possessionId: string;

  playerId: string;
  receiverId: string;

  from: Coordinate;
  to: Coordinate;

  passType: 'short';

  success: boolean;

  pressure: number;

  expectedSuccess: number;
}
```

Then generate commentary:

```ts
commentary.render(event);
```

resulting in:

```text
Phranq Rook finds Pro Mann with a short pass.
```

Do not store the sentence as the primary representation.

This is crucial for ML later.

---

# Phase 21 — Record decisions, not just events

This is your future goldmine.

For every decision, optionally record:

```ts
interface DecisionRecord {
  matchId: string;

  tick: number;

  playerId: string;

  observation: PlayerObservation;

  teamIntent: TeamIntent;

  candidates: CandidateAction[];

  selectedAction: PlayerIntent;

  outcome?: ActionOutcome;
}
```

Example:

```json
{
  "tick": 3872,
  "player": "P000214",

  "state": {
    "goalDistance": 21.3,
    "pressure": 2,
    "scoreDifference": -1
  },

  "options": [
    {
      "type": "shoot",
      "utility": 0.31
    },
    {
      "type": "pass",
      "target": "P000211",
      "utility": 0.74
    },
    {
      "type": "carry",
      "utility": 0.62
    }
  ],

  "selected": {
    "type": "carry"
  }
}
```

You don't necessarily store this forever in production.

You can enable:

```ts
simulationMode: {
  collectTrainingData: true;
}
```

when running simulations offline.

---

# Phase 22 — Separate simulation RNG

Replace direct:

```ts
Math.random();
```

such as your current `gimmeAChance()`.

Use:

```ts
interface RandomSource {
  next(): number;
}
```

Then:

```ts
class SeededRandom implements RandomSource {}
```

This lets you run:

```text
Match seed 183763
```

and reproduce exactly the same match.

This will be invaluable for debugging.

You can test:

> Did my change to passing behaviour cause this bizarre 63rd-minute goal?

by replaying exactly the same random sequence.

I would do this fairly early.

---

# Phase 23 — Create simulation debugging tools

Build a dev-only match viewer.

You already have coordinate-based football logic, so visualize:

```text
players
ball
formation anchors
player intentions
passing lanes
pressure radius
movement targets
team shape
```

For example:

```text
● attacker
○ defender
→ intended movement
---- intended pass
```

Click a player and display:

```text
Phranq Rook

Current role:
Inside Forward

Team phase:
Final Third

Pressure:
2

Options:
Pass Mann      0.71
Carry          0.63
Shoot          0.42

Selected:
Carry
```

This will be far more useful than reading logs.

---

# Phase 24 — Calibrate against football statistics

Once the architecture is stable, tune it against broad real-world ranges.

Not exact Premier League replication; just sanity constraints.

Things such as:

```text
passes/team/match
shots/team/match
pass completion
possession duration
tackle frequency
shot conversion
goal distribution
```

Then validate style differences.

For instance:

```text
high-tempo team
```

should statistically show:

```text
more possessions
more direct passes
more turnovers
shorter possession duration
```

A cautious team should show the opposite.

This tests whether your tactics actually mean something.

---

# Phase 25 — Add higher-level player memory

Only after everything above.

Players can keep lightweight short-term context:

```ts
interface PlayerMemory {
  recentFailedDribbles: number;

  recentShots: number;

  opponentBeatenRecently?: string;

  recentlyPressedBy?: string[];

  lastAction?: PlayerIntent;
}
```

Then:

```text
player attempts three unsuccessful dribbles
↓
confidence falls
↓
slightly more likely to pass
```

Or:

```text
winger repeatedly beats same fullback
↓
more willingness to attack him
```

Don't build full cognitive agents.

Small state is enough.

---

# Phase 26 — Introduce fatigue and dynamic condition

Player state should change throughout the match.

```ts
interface PlayerMatchCondition {
  stamina: number;

  fatigue: number;

  confidence: number;

  sharpness: number;

  injuryRisk: number;
}
```

Fatigue affects:

```text
movement speed
pressing
decision execution
control
tackle timing
shot precision
```

Tactics then have genuine consequences.

High pressing for 90 minutes becomes expensive.

---

# Phase 27 — Add manager decisions

Now the team controller can occasionally alter tactics.

For example:

```text
75'
losing 0-1
↓
risk increases
defensive line rises
tempo increases
fullbacks push higher
```

Or:

```text
82'
winning 2-0
↓
tempo decreases
risk decreases
shape compresses
```

Managers aren't controlling individual moves.

They're altering the environment under which player agents make decisions.

---

# Phase 28 — Prepare the policy interface for ML

Eventually define:

```ts
interface PlayerPolicy {
  decide(observation: PlayerObservation, context: PlayerContext): PlayerIntent;
}
```

Implementation one:

```ts
class RuleBasedPlayerPolicy
  implements PlayerPolicy
```

Later:

```ts
class NeuralPlayerPolicy
  implements PlayerPolicy
```

Then your simulator doesn't care which one is used.

```ts
const policy =
  config.policy === 'neural'
    ? new NeuralPlayerPolicy(model)
    : new RuleBasedPlayerPolicy();
```

That's the long-term architectural payoff.

---

# Phase 29 — First ML experiment

Do **not** start by trying to generate entire matches.

Your first ML task should be:

> Given the player's observation, predict the player's chosen action.

Classes:

```text
SHORT_PASS
LONG_PASS
CARRY
DRIBBLE
SHOOT
```

For example:

$$
P(action|observation)
$$

You could train a very small neural network first.

You don't even need a Transformer.

A simple MLP could take:

```text
shooting
passing
mental
dribbling

x
y

goal distance
goal angle

pressure

nearest teammate
nearest opponent

team tempo
team risk

score difference
minute
```

and output:

```text
Pass    .47
Carry   .24
Shoot   .18
Dribble .08
Long    .03
```

That alone would teach you a huge amount.

---

# Phase 30 — Then experiment with a Transformer

Only when you have sequences.

For each player:

```text
previous state/action
previous state/action
previous state/action
...
current state
```

Then predict:

```text
next action
```

Now attention can learn things like:

> This player recently received the ball twice under pressure.

or:

> This possession has progressed down the right wing for the past five actions.

That's when a Transformer starts becoming justified.

---

# The codebase structure I'd aim toward

Something approximately like:

```text
simulation/

  MatchEngine.ts

  state/
    MatchState.ts
    BallState.ts
    PossessionState.ts
    PlayerMatchState.ts

  team/
    TeamController.ts
    TeamIntent.ts
    TeamPhase.ts

  player/
    PlayerPolicy.ts
    RuleBasedPlayerPolicy.ts
    PlayerObservation.ts
    ObservationBuilder.ts
    PlayerRole.ts
    PlayerTendencies.ts

  spatial/
    SpatialAnalyzer.ts
    PassingAnalyzer.ts
    PressureAnalyzer.ts

  actions/
    PlayerIntent.ts
    PassIntent.ts
    ShotIntent.ts
    MovementIntent.ts

  resolver/
    IntentResolver.ts
    PassResolver.ts
    ShotResolver.ts
    TackleResolver.ts
    MovementResolver.ts

  events/
    MatchEvent.ts
    EventRecorder.ts
    CommentaryGenerator.ts

  randomness/
    RandomSource.ts
    SeededRandom.ts

  config/
    SimulationConfig.ts

  analytics/
    SimulationMetrics.ts
    DecisionRecorder.ts
```

Your current `Decider` gets dismantled gradually across these areas rather than deleted in one go.

For example:

```text
Decider.countPressure()
        ↓
SpatialAnalyzer

Decider.laneIsClear()
        ↓
PassingAnalyzer

Decider.getPassResult()
        ↓
PassResolver

Decider.getShotResult()
        ↓
ShotResolver

Decider.getTackleResult()
        ↓
TackleResolver

Decider.makeDecision()
        ↓
RuleBasedPlayerPolicy
```

That's a very natural refactor from what you already have.

# The order I would actually implement it

Don't implement all 30 conceptual phases one after another literally. I'd make the project into **six practical milestones**:

| Milestone                 | Deliverable                                                    |
| ------------------------- | -------------------------------------------------------------- |
| **1. Foundation**         | MatchState, seeded RNG, structured events, benchmark suite     |
| **2. Football structure** | Possessions, phases, TeamIntent, formation anchors             |
| **3. Player agents**      | PlayerObservation, PlayerPolicy, off-ball decisions, roles     |
| **4. Simulation engine**  | intentions → simultaneous resolution → ball/movement           |
| **5. Behaviour quality**  | score-based decisions, tendencies, fatigue, manager adaptation |
| **6. Learning layer**     | decision dataset → basic classifier → learned PlayerPolicy     |

I would resist touching ML until **Milestone 4 is working**.

The reason is important.

A learned model can only learn the world you give it.

If your current simulator contains:

```text
ball holder
→ random choice
→ outcome
```

then a model trained on millions of those matches will mostly become extremely good at imitating those simplistic rules.

You want your training data to instead contain:

```text
team shape
+
off-ball movement
+
space
+
pressure
+
possession phase
+
player role
+
match context
+
candidate actions
+
decision
+
outcome
```

Then the learned model actually has something meaningful to discover.

## What I would make your immediate next sprint

I would stop at a relatively small boundary for the first implementation:

```text
1. MatchState
2. BallState
3. PossessionState
4. TeamIntent
5. PlayerObservation
6. PlayerIntent
7. RuleBasedPlayerPolicy
8. seeded RNG
9. structured events
10. preserve existing resolver formulas
```

Specifically **do not change your existing pass/shot/dribble/tackle probabilities much during that sprint**. Your current resolution logic can survive temporarily.

That way you're changing the **architecture without simultaneously changing the football model**.

Once those abstractions are working, the second sprint can attack:

> off-ball movement + simultaneous actions.

That is where I expect you'll see the first major qualitative leap in your matches.

And the architectural principle I'd keep written at the top of the project is:

> **Teams decide what they are trying to do. Players decide what they intend to do. The match engine decides what actually happens.**

If you preserve that separation, you can keep adding sophistication for years—including learned models—without turning the simulator into an unmaintainable mass of football-specific `if` statements.

# Simulation Design - Chunked Simulation:

Exactly. That is the right mental model.

What you are describing is essentially a **state transition system**:

$$
S_{t+1} = F(S_t, I_t)
$$

where:

- `S_t` = the complete current match state
- `I_t` = any new intervention, such as a tactical change or substitution
- `F` = the simulator
- `S_{t+1}` = the next match state

The simulator should not need to ask the database, frontend, manager service, or any other external system what happened previously. Everything relevant to continuing the match should already be inside the state you give it.

That is a very strong design.

Your engine then becomes conceptually:

```ts
const nextState = advanceMatch(currentState, {
  untilMinute: 15,
});
```

and later:

```ts
const nextState = advanceMatch(currentState, {
  untilMinute: 30,
});
```

If a manager intervenes:

```ts
currentState.home.tactics.mentality = 'attacking';
currentState.home.tactics.tempo = 0.8;

const nextState = advanceMatch(currentState, {
  untilMinute: 45,
});
```

The engine does not care where that tactical change came from.

It just sees a different state.

## The state should be complete enough to resume anywhere

I would aim for something like:

```ts
interface MatchState {
  matchId: string;

  clock: MatchClock;

  score: ScoreState;

  ball: BallState;
  possession: PossessionState;

  home: TeamMatchState;
  away: TeamMatchState;

  players: Record<string, PlayerMatchState>;

  substitutions: SubstitutionState;

  cards: CardState;

  matchPhase: MatchPhase;

  rng: RandomState;

  recentEvents: MatchEvent[];

  status:
    'not-started' | 'first-half' | 'half-time' | 'second-half' | 'finished';
}
```

Then `PlayerMatchState` contains all the match-specific things about that player:

```ts
interface PlayerMatchState {
  playerId: string;
  teamId: string;

  position: Coordinate;

  role: PlayerRole;

  onPitch: boolean;

  yellowCards: number;
  redCard: boolean;

  fatigue: number;
  confidence: number;

  currentAction?: PlayerIntent;

  hasBall: boolean;

  minutesPlayed: number;

  matchStats: {
    goals: number;
    assists: number;
    shots: number;
    passes: number;
    tackles: number;
  };
}
```

Notice that this is not necessarily the same thing as your permanent database `Player`.

Your permanent player might contain:

```ts
{
  (id, name, shooting, passing, tackling, stamina);
}
```

while the match version contains:

```ts
{
  (playerId, fatigue, yellowCards, position, confidence, minutesPlayed);
}
```

Those two ideas should stay separate.

A player's permanent attributes answer:

> Who is this player?

The match state answers:

> What is happening to this player in this particular match?

---

And yes, your examples all become ordinary state transitions.

A goal:

```text
Before
score: 1-1
ball holder: striker
phase: final-third

↓ shot
↓ goal

After
score: 2-1
ball: centre spot
possession: opponent
phase: restart
```

A yellow card:

```text
Before
player.yellowCards = 0

↓ foul
↓ referee books player

After
player.yellowCards = 1
```

Then later:

```text
player.yellowCards = 1

↓ second yellow

player.yellowCards = 2
player.redCard = true
player.onPitch = false
```

Now the next simulation chunk automatically sees:

```text
11 players vs 10 players
```

The team controller may react:

```text
4-3-3
↓ red card
4-4-1
```

and the player policies naturally operate with only ten players available.

You don't have to create a special "red card simulation mode."

The state itself describes the new world.

## Substitutions are the same thing

At halftime:

```ts
applySubstitution(state, {
  teamId: 'GU',
  playerOut: 'P102',
  playerIn: 'P231',
});
```

That operation modifies the state:

```ts
state.players['P102'].onPitch = false;

state.players['P231'] = {
  ...
  onPitch: true,
  fatigue: 0,
  minutesPlayed: 0
};
```

The next:

```ts
advanceMatch(state, {
  untilMinute: 60,
});
```

simply sees the replacement player.

This is much cleaner than teaching the simulator about some external "substitution history."

---

The AI manager becomes surprisingly simple too.

At halftime:

```ts
let state = advanceMatch(state, {
  until: 'half-time',
});
```

Then:

```ts
const aiDecision = aiManager.decide(state);
```

Maybe:

```ts
{
  tacticalChanges: {
    mentality: 'attacking',
    pressing: 0.75
  },

  substitutions: [
    {
      playerOut: 'P8',
      playerIn: 'P14'
    }
  ]
}
```

Apply them:

```ts
state = applyManagerDecision(state, aiDecision);
```

Then:

```ts
state = advanceMatch(state, {
  untilMinute: 90,
});
```

That gives you a very clean separation:

```text
MatchState
     │
     ├── AI manager reads it
     │
     ├── Human manager reads it
     │
     └── Simulator reads it
```

Both human and AI managers modify the same kinds of state.

That is excellent because you don't need separate simulation rules for:

```text
human manager
AI manager
CPU-vs-CPU
```

They all use the same engine.

## I would go one step further: don't mutate arbitrarily

Conceptually, you're correct that "changing tactics means updating the latest state."

But in the implementation I'd prefer explicit transition functions rather than different parts of your program directly poking at the object:

```ts
state.home.tactics.press = 90;
```

Prefer:

```ts
state = applyTacticalChange(state, {
  teamId: state.home.teamId,
  pressing: 90,
});
```

Likewise:

```ts
state = applySubstitution(state, change);
state = applyCard(state, card);
state = applyGoal(state, goal);
```

Why?

Because these functions can enforce invariants.

For example:

```ts
applySubstitution();
```

can check:

```text
player is actually on pitch
replacement is on bench
substitution limit hasn't been reached
replacement isn't suspended
```

`applyTacticalChange()` can ensure:

```text
formation is valid
roles are filled
only players currently on pitch receive assignments
```

It also gives you a natural place to generate events.

```ts
const result = applyTacticalChange(state, change);

result.events;
// [
//   {
//     type: 'TACTICAL_CHANGE',
//     ...
//   }
// ]
```

---

I would therefore think of the engine as having **two kinds of transitions**.

Simulation transitions:

```text
pass
run
tackle
shot
save
goal
foul
fatigue
time passing
```

Manager/game transitions:

```text
substitution
formation change
role change
tempo change
mentality change
pressing change
```

Both ultimately produce:

```text
old MatchState
       +
transition
       ↓
new MatchState
```

That becomes a beautifully predictable architecture.

## And chunks don't actually have to mean fixed 15-minute blocks

Your engine can support:

```ts
advanceMatch(state, {
  untilMinute: 45,
});
```

but internally process tiny ticks:

```text
20:00
20:02
20:04
20:06
...
44:58
45:00
```

The **chunk** is just how much work the caller requests.

So:

```ts
advanceMatch(state, {
  untilMinute: 45,
});
```

doesn't mean:

> Jump magically from minute 30 to 45.

It means:

> Keep applying state transitions until the clock reaches 45.

That's an important distinction.

---

For your actual fast-simulation game, I'd probably expose natural stopping points:

```ts
type AdvanceUntil =
  | { minute: number }
  | { event: 'half-time' }
  | { event: 'full-time' }
  | { event: 'next-stoppage' };
```

Then normal CPU-vs-CPU might simply be:

```ts
state = advanceMatch(state, {
  until: { event: 'half-time' },
});

state = applyManagerDecision(state, awayAI.decide(state));

state = applyManagerDecision(state, homeAI.decide(state));

state = advanceMatch(state, {
  until: { event: 'full-time' },
});
```

While a human playing against AI could be:

```text
Simulate first half
↓
show halftime screen
↓
human changes tactics
↓
AI changes tactics
↓
simulate second half
↓
full time
```

And later, if you allow humans to stop at 60':

```text
Simulate to 60'
↓
make substitution
↓
Continue
```

the engine already supports it.

---

There is also a very nice consequence for saving games.

If `MatchState` is genuinely self-contained, then this:

```json
{
  "matchId": "...",
  "clock": 63,
  "score": {...},
  "players": {...},
  "ball": {...},
  "tactics": {...},
  "rng": {...}
}
```

is essentially a **save game**.

You could:

```text
serialize
↓
store
↓
restart server
↓
deserialize
↓
continue
```

and the simulation doesn't care.

That is a strong sign that you've drawn the architecture correctly.

The only external information the simulator should ideally require is the **initial state**:

```text
fixture
players
player attributes
starting eleven
bench
formation
tactics
rules/configuration
random seed
```

From kickoff onward:

```text
S0
↓
S1
↓
S2
↓
S3
↓
...
↓
Sfinal
```

Each state contains everything necessary to derive the next one.

That is also exactly the sort of architecture that will make the learned-model direction much easier later, because your eventual model's entire job becomes approximately:

$$
P(\text{next action/state change} \mid S_t)
$$

You are effectively turning your football game into a small **world model**: a self-contained world state plus rules/policies that determine how that world evolves. That is much more powerful than thinking of the simulator as a function that merely generates a list of match events.

# Architecture Plan:

I would instead make your simulator into a package first.

Since you've been using a monorepo, something like:

apps/
api/
web/
match-worker/

packages/
simulation/
src/
MatchEngine.ts
state/
team/
player/
resolver/

Then:

@fspro/simulation

contains zero:

Express
HTTP
database queries
Vue
queues

It receives plain data:

const result = simulateMatch({
fixture,
home,
away,
tactics,
seed
});

and returns:

{
finalState,
events,
statistics,
decisions
}

Then your worker does the infrastructure stuff:

const match = await db.getFixture(id);

const result = simulator.simulate(match);

await db.saveResult(result);

That's a very clean boundary.

Later, if simulation actually becomes expensive, you've given yourself a perfect migration path.

You can replace:

packages/simulation
TypeScript

with:

services/simulation
Go

without redesigning your entire game.

The interface stays:

SimulateMatchRequest
↓
simulation engine
↓
SimulateMatchResult

apps/
api/
web/
match-worker/

packages/
simulation/
src/
MatchEngine.ts
state/
team/
player/
resolver/

Main App / API
│
├── schedules match
├── stores teams / players / tactics
│
▼
Simulation Queue
│
▼
Match Simulation Worker
│
├── loads match snapshot
├── simulates full match
├── writes events/results
└── exits / waits for next job
