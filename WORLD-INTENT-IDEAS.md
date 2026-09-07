Yes — that makes the architecture much stronger.

The **World Planner should be a probabilistic interpreter of the whole world**, not a director issuing outcomes.

So instead of:

> “Sharks FC will beat Turbo FC.”

it should produce something closer to:

> “Because Sharks FC recently received new investment, morale is high, while Turbo FC is dealing with civic unrest affecting attendance and finances. Sharks are more likely than usual to perform well.”

Then the football system gets **influences**, not an outcome.

The architecture becomes:

```text
                 WORLD STATE
                     │
       ┌─────────────┼─────────────┐
       │             │             │
   Football       Economy      Civic/Political
    State          State           State
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                World Planner
                     │
             derives influences
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
   Football       Economy       Civic
  Influences     Influences    Influences
       │             │             │
       ▼             ▼             ▼
   Football       Economy       Civic
    Engine         Engine        Engine
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                  Events
                     │
                     ▼
               New World State
```

The crucial point is:

**Subsystems don't need to know about each other. They only need to understand influences expressed in their own language.**

For example, your economic system might know:

```ts
{
  clubId: "sharks-fc",
  cashReserves: 120_000_000,
  wagePressure: 0.32,
  sponsorConfidence: 0.81
}
```

Your civic system might know:

```ts
{
  cityId: "kola",
  publicMood: 0.74,
  unrest: 0.08,
  footballInterest: 0.91
}
```

And football knows:

```ts
{
  morale: 0.63,
  squadFitness: 0.77,
  managerConfidence: 0.56
}
```

Football does **not** need to understand `sponsorConfidence` or `publicMood`.

The World Planner translates them into football-relevant influences.

For example:

```ts
interface FootballInfluence {
  target: {
    type: 'club' | 'player' | 'manager';
    id: string;
  };

  factor:
    | 'morale'
    | 'pressure'
    | 'fatigue'
    | 'confidence'
    | 'availability'
    | 'cohesion';

  effect: number;

  duration?: number;

  source: WorldEventRef;
}
```

So perhaps:

```json
{
  "target": {
    "type": "club",
    "id": "sharks-fc"
  },
  "factor": "morale",
  "effect": 0.12,
  "source": "major-sponsorship-deal"
}
```

The football simulator knows perfectly well what `morale +0.12` means.

It doesn't need to know anything about sponsorship contracts.

Similarly, civic unrest might become:

```json
{
  "target": {
    "type": "club",
    "id": "turbo-fc"
  },
  "factor": "pressure",
  "effect": 0.18,
  "source": "city-protests"
}
```

Then your existing nondeterministic football simulator still determines the match.

Perhaps before the world influences:

```text
Sharks win: 37%
Draw:       29%
Turbo win:  34%
```

After everything happening in the world:

```text
Sharks win: 48%
Draw:       27%
Turbo win:  25%
```

And then the simulator rolls the world forward.

Turbo might **still win**.

That's important.

Otherwise you've built an LLM-written story generator rather than a world simulation.

## I would make the World Planner produce hypotheses

This is an interesting distinction.

Instead of outputting "plans" like:

```ts
{
  action: 'Sharks beats Turbo';
}
```

have it output something more like:

```ts
interface WorldHypothesis {
  observation: string;

  causes: WorldCause[];

  affectedEntities: EntityRef[];

  expectedEffects: ProposedInfluence[];

  confidence: number;
}
```

Example:

```json
{
  "observation": "Sharks FC may perform unusually well in upcoming matches.",

  "causes": [
    {
      "event": "new-investment",
      "weight": 0.7
    },
    {
      "event": "recent-winning-streak",
      "weight": 0.6
    },
    {
      "event": "manager-contract-extension",
      "weight": 0.3
    }
  ],

  "expectedEffects": [
    {
      "system": "football",
      "target": "sharks-fc",
      "factor": "morale",
      "direction": "increase",
      "magnitude": "moderate"
    }
  ],

  "confidence": 0.72
}
```

Then a deterministic layer converts:

```text
"moderate morale increase"
```

into:

```ts
moraleModifier = +0.08;
```

**I would not let the LLM choose `+0.08`.**

That's important.

Have the LLM reason semantically:

```text
tiny
small
moderate
large
extreme
```

Your game systems translate those concepts into actual numbers.

Otherwise you'll quickly get LLM outputs like:

```text
morale +47%
economic productivity +350%
political stability -0.837
```

with no coherent scale.

## This creates three layers

I'd formalize them as:

```text
1. INTERPRETATION

World Planner:
"What does everything currently happening imply?"

            ↓

2. TRANSLATION

Influence Resolver:
"What game-system modifiers correspond to those implications?"

            ↓

3. SIMULATION

Subsystem:
"Given these modifiers and my own state/rules,
what actually happens?"
```

For example:

```text
ECONOMY

Sharks receives major investment
           │
           ▼
WORLD PLANNER

"Players may feel greater optimism;
manager has stronger institutional support."
           │
           ▼
INFLUENCE RESOLVER

football:
  club morale + small
  manager confidence + moderate
           │
           ▼
FOOTBALL ENGINE

players' decision/execution distributions
change slightly
           │
           ▼
MATCH

Sharks 1–2 Turbo
```

And that's completely valid.

The world expected one thing.

Something else happened.

That unexpected result then becomes **new information for the world**.

```text
Major investment
+
high morale
+
home game
+
still lost to Turbo
        │
        ▼
World Planner

"Despite considerable optimism around Sharks,
the club has now suffered an unexpected defeat."
```

And perhaps:

```text
confidence ↓
fan frustration ↑
manager pressure ↑
media scrutiny ↑
```

Now you're getting feedback loops.

That's where this becomes really interesting.

## Your systems become causally connected without becoming coupled

Imagine this:

```text
Political system
    │
    │ government increases
    │ infrastructure spending
    ▼
Economic system
    │
    │ city economy improves
    ▼
World Planner
    │
    │ increased prosperity might
    │ affect local institutions
    ▼
Football influence
    │
    │ attendance potential ↑
    │ sponsorship potential ↑
    ▼
Football system
    │
    │ club revenue rises
    ▼
Economic system
```

Notice:

```text
Football doesn't import PoliticalSystem.

PoliticalSystem doesn't import FootballEngine.
```

They communicate through:

```text
World Events
+
World Influences
```

That is a very useful boundary.

## Events should be the shared language of the world

Each subsystem should publish what happened:

```ts
interface WorldEvent {
  id: string;
  tick: number;

  system: 'football' | 'economy' | 'civic' | 'political' | 'demographics';

  type: string;

  entities: EntityRef[];

  data: unknown;
}
```

Football might publish:

```json
{
  "system": "football",
  "type": "club.match.lost",
  "entities": ["sharks-fc", "turbo-fc"],
  "data": {
    "homeScore": 1,
    "awayScore": 2
  }
}
```

Economy:

```json
{
  "system": "economy",
  "type": "company.closed",
  "entities": ["kola-steel"],
  "data": {
    "employeesAffected": 1800
  }
}
```

Civic:

```json
{
  "system": "civic",
  "type": "public-protest",
  "entities": ["kola"],
  "data": {
    "severity": "moderate"
  }
}
```

The World Planner reads that stream alongside current entity state and asks:

> What consequences might reasonably follow?

That's a much better job for an LLM than calculating football passes.

## There should probably be persistence/decay too

Not every influence should disappear immediately.

Suppose:

```text
Sharks wins championship
```

That may cause:

```text
fan enthusiasm +large
player confidence +moderate
sponsor interest +moderate
```

But they decay differently:

```ts
{
  factor: "player-confidence",
  magnitude: "moderate",
  decay: "fast"
}

{
  factor: "fan-interest",
  magnitude: "large",
  decay: "slow"
}

{
  factor: "club-prestige",
  magnitude: "small",
  decay: "permanent"
}
```

Your deterministic resolver can translate those into actual curves.

This also prevents the LLM from having to remember every consequence forever.

The world state remembers it.

## And some effects should have thresholds

Not every world event should influence every other subsystem.

For example:

```text
small local protest
```

probably shouldn't affect Sharks FC.

But:

```text
citywide strike
stadium transport shut down
```

might.

So your influence resolver can apply thresholds:

```ts
if (
  event.type === "public-protest" &&
  event.severity >= MODERATE &&
  event.placeId === club.placeId
) {
   ...
}
```

The LLM can identify semantic relationships; your engine can enforce actual applicability.

## I would therefore rename the World Planner concept slightly

You're right that "Planner" starts sounding like:

> here's what should happen next.

What you're actually describing is closer to a:

**World Reasoner** or **World Interpreter**.

Its job is:

```text
current world
+
recent history
+
relationships
        ↓
possible consequences
+
likely pressures
+
emerging situations
```

You could still have a separate `WorldPlanner` later for deliberate actors:

```text
King wants to invade neighbour.
Company wants to expand.
Mayor wants reelection.
Club owner wants championship.
```

Those are actual **plans**.

So eventually:

```text
World Reasoner
    │
    ├── recognizes consequences
    │
    └── identifies emerging situations

Actor Planner
    │
    └── decides what agents want to do

Subsystems
    │
    └── determine what actually happens
```

That separation could be very powerful.

For example:

```text
World Reasoner:

"Turbo FC's financial problems are likely
to create pressure on the club."

Club Owner Agent:

"I need to sell players."

Football system:

receives transfer listing actions.

Transfer market:

maybe buyers appear, maybe they don't.
```

Nobody controls the outcome.

## So the core loop of your world could become

```text
                 WORLD STATE t
                      │
                      ▼
              WORLD REASONER
                      │
             possible influences
                      │
                      ▼
              INFLUENCE RESOLVER
                      │
            subsystem modifiers
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
   FOOTBALL        ECONOMY        CIVIC
       │              │              │
       ▼              ▼              ▼
                  EVENTS
                      │
                      ▼
                 WORLD STATE
                     t+1
                      │
                      └───────────────↻
```

And the fundamental philosophy becomes:

> **The World Reasoner predicts pressures. The systems produce consequences. The world records what actually happened.**

That gets you much closer to the imaginative world you originally described: the LLM doesn't write the world as fiction. It helps **interpret causal relationships that are too broad or fuzzy to encode manually**, while your individual simulations preserve uncertainty and agency.

The result should be capable of surprising even the LLM that suggested what was likely to happen — which, for this kind of world simulator, is exactly what you want.
