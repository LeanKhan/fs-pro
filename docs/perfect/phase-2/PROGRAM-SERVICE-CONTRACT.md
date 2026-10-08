# PROGRAM-SERVICE-CONTRACT.md — frozen HTTP contract for Phase 2 Batch 2

**Owner:** Agent 2A (Go `services/world-service/internal/program`).
**Consumers:** 2A (implements verbatim), 2B and 2C (call it verbatim from Node).
**Sources:** `OWNER-PROGRAM-SPEC.md` §3–§6, §10.2, §14; `ADVISOR-SPEC.md` §5.
**Status:** FROZEN. 2B/2C implement this document, not a paraphrase of it. Any
change is a new contract revision the lead records in `DECISIONS.md`.

This is the **Go boundary** contract. It is not the client-facing ts-rest
contract (that is Node's, `OWNER-PROGRAM-SPEC.md` §10.1, owned by 2B). Node
reads facts from the database, calls these endpoints, and writes the
`OwnerProgram` row and every money ledger itself. The Go program engine is
**pure**: it never reads or writes the database, `Clubs.Budget` or `Clubs.XP`.

Conventions, matching `WORLD-SERVICE-CONTRACT.md`:

- JSON is camelCase. Ids are strings. Money is a plain number in stored Villa
  units (1 stored unit = V1; display formatting is the client's concern, L13).
- Success is 2xx `application/json`. Errors are non-2xx with a body
  `{ "error": "string" }`.
- Field names below are the **zod schema names** required in
  `packages/api-contract/src/schemas/program-service.ts` (R6) and mirrored
  field-for-field in Go. Node and Go must not drift.
- The program engine is deterministic: the same request yields the same
  response, always. There is no clock, no RNG and no DB inside evaluate/tip.

---

## 1. Shared types

### 1.1 `ProgramStep` (enum)

```json
"manager" | "players" | "facilities" | "level1"
```

The persisted `OwnerProgram.Step` also uses `not_started` and `done`
(`OWNER-PROGRAM-SPEC.md` §3.1, §9.1), but **only the four active steps are ever
evaluated**. `nextStep` may return `"done"`. `not_started` never crosses the
Go boundary.

### 1.2 `StepFacts` (the pure input snapshot)

This is the **whole** input to step evaluation, star scoring and tip rules. Node
builds it from the DB immediately before the call. No fields are optional except
`manager` (null when unsigned); the zero value is meaningful.

```json
{
  "step": "manager",
  "startingBalance": 1000000,
  "budget": 1000000,
  "manager": {
    "overall": 62,
    "tactics": 65,
    "motivation": 60,
    "development": 60,
    "discipline": 58,
    "signingFee": 360000,
    "wage": 18000,
    "contractYears": 3
  },
  "squad": { "total": 0, "gk": 0, "def": 0, "mid": 0, "att": 0, "medianRating": 0 },
  "assets": [],
  "programXp": 0,
  "clubXp": 0,
  "friendlies": { "wins": 0, "draws": 0, "losses": 0 },
  "scout": { "managersBrowsed": 0, "interviewedManagerIds": [], "scoutedPlayerIds": [] },
  "events": { "playBlocked": false, "sessionMinutes": 0, "programCompletedOnce": false }
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `step` | `ProgramStep` | The step being evaluated. |
| `startingBalance` | number | The V1M–V5M draw at founding. Also called `PlayerBudget` in the spec (§3.2 step 1); 2A interprets it as the drawn starting balance and the fee ratio is measured against it. |
| `budget` | number | Current `Clubs.Budget` (cash on hand). |
| `manager` | object \| null | The signed manager, or null. |
| `manager.overall` | int | `round(0.40*Tactics + 0.20*Motivation + 0.25*Development + 0.15*Discipline)` (spec §6.1). |
| `manager.*` | int | The four attributes. |
| `manager.signingFee` | number | Fee actually paid (after any interview negotiation). |
| `manager.wage` | number | Per Year. |
| `manager.contractYears` | int | Remaining contract years; step completion needs `> 0`. |
| `squad.total` | int | Signed, non-retired players. |
| `squad.gk/def/mid/att` | int | Counts by position. |
| `squad.medianRating` | number | Median `Rating` of the club's best XI (best 11 by Rating; spec §3.2 step 2). |
| `assets` | array | One entry per `ClubAssets` row. |
| `assets[].type` | string | `stadium_grounds`, `stands`, `training_ground`, `youth_academy`, `scouting`, `medical_centre`, `staff_house`. |
| `assets[].tier` | int | Completed Tier (spec §5.4; the code still names this `Level`, R5′). |
| `assets[].upgradingTo` | int \| null | Tier being built, or null. |
| `assets[].hasEffect` | bool | True when the tier's `effects()` value is non-zero (always true for a completed Tier ≥ 1 in the shipped config). |
| `programXp` | int | Program XP accumulated from **other** steps (excluding the step being evaluated). Used by the `level1` ★2/★3 predicate. Capped at 54 by the caller. |
| `clubXp` | int | `Clubs.XP`. |
| `friendlies.wins/draws/losses` | int | Qualifying-friendly results at Level 0. `wins` are the "clean wins" of §3.2. |
| `scout.managersBrowsed` | int | Distinct managers the owner has opened, for `tip.manager.scout`. |
| `scout.interviewedManagerIds` | string[] | Managers already interviewed. |
| `scout.scoutedPlayerIds` | string[] | Players already scouted. |
| `events.playBlocked` | bool | PLAY was pressed while the squad was illegal this session (`tip.play.gate`). |
| `events.sessionMinutes` | number | Continuous session length in real minutes (`tip.idle.break`). |
| `events.programCompletedOnce` | bool | The owner has completed the program before (`tip.veteran.quiet`). |

### 1.3 `AdvisorLine`

Adopted from `ADVISOR-SPEC.md` §5.1 with one wire rename: the spec's `cooldown`
is `cooldownSeconds` here (the repo's wire convention, cf. `uptimeSeconds`).

```json
{
  "id": "step.manager.arrive",
  "speaker": "vintra",
  "text": "Right then. Every club needs one voice on the training pitch.",
  "expr": "neutral",
  "pose": "idle",
  "target": null,
  "priority": 80,
  "dismissible": true,
  "maxShows": 1,
  "cooldownSeconds": 0,
  "once": false
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable rule id (the tip table, §7). |
| `speaker` | `"vintra"` | The advisor. |
| `text` | string | Rendered line; money already in Villa. |
| `expr` | `"neutral"\|"happy"\|"excited"\|"worried"\|"thinking"` | Expression. |
| `pose` | `"idle"\|"point-right"\|"point-left"` | Pose. |
| `target` | asset type \| null | The building the pose points at. |
| `priority` | int 0–100 | Selection band (spec §5.3). |
| `dismissible` | bool | The owner may dismiss it. |
| `maxShows` | int | Show cap. |
| `cooldownSeconds` | int | Minimum gap between shows. |
| `once` | bool | Fires at most once per club, ever. |

---

## 2. `GET /program/steps`

The step table and constants, for tests, 2B's validator and client hints. No
request body.

Response 200 (`ProgramStepsConfig`):

```json
{
  "steps": [
    {
      "id": "manager",
      "order": 1,
      "rewards": { "1": 3, "2": 9, "3": 18 },
      "starLabels": {
        "1": "Any hire with a live contract.",
        "2": "Overall ≥ 55 or fee ≤ 40% of the starting balance.",
        "3": "Overall ≥ 60, fee ≤ 40%, and at least V400k cash left."
      },
      "advisorRules": [
        "step.manager.arrive", "step.manager.nudge",
        "step.manager.done.1", "step.manager.done.2", "step.manager.done.3",
        "step.manager.blocked"
      ]
    },
    { "id": "players", "order": 2, "rewards": { "1": 3, "2": 9, "3": 18 }, "starLabels": { "...": "..." }, "advisorRules": ["..."] },
    { "id": "facilities", "order": 3, "rewards": { "1": 3, "2": 9, "3": 18 }, "starLabels": { "...": "..." }, "advisorRules": ["..."] },
    { "id": "level1", "order": 4, "rewards": { "1": 0, "2": 0, "3": 0 }, "starLabels": { "...": "..." }, "advisorRules": ["..."] }
  ],
  "programXpCap": 54,
  "level1Xp": 100,
  "matchXp": { "win": 30, "draw": 10, "loss": 5 },
  "fees": { "interview": 25000, "scout": 15000 }
}
```

`advisorRules` lists the rule ids §7 defines for that step. The step `rewards`
for `level1` are all 0: the goal itself pays no program XP (spec §3.2).

---

## 3. `POST /program/evaluate`

Evaluate one step: completion, stars, reward XP, reasons and the framing lines.
Idempotent and stateless.

Request (`ProgramEvaluateRequest`):

```json
{ "step": "manager", "facts": { "...StepFacts...": "..." } }
```

`step` must equal `facts.step`; otherwise 400 (`step and facts.step disagree`).

Response 200 (`ProgramEvaluation`):

```json
{
  "step": "manager",
  "completed": true,
  "stars": 3,
  "xp": 18,
  "programXp": 18,
  "reasons": [
    "manager signed with 3 contract year(s)",
    "overall 62 ≥ 60",
    "fee 360000 ≤ 40% of starting balance 1000000",
    "budget 620000 ≥ 400000"
  ],
  "advisor": [ { "...AdvisorLine...": "..." } ]
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `completed` | bool | The step predicate (§5) holds. |
| `stars` | 0–3 | 0 when not completed, else the highest star predicate that holds. |
| `xp` | int | Reward for `stars` (`{1:3,2:9,3:18}`; 0 for 0 stars and for `level1`). |
| `programXp` | int | `min(54, facts.programXp + xp)` — the total after this step. Node persists this. |
| `reasons` | string[] | Deterministic explanation, one per predicate clause. |
| `advisor` | `AdvisorLine[]` | Zero or one line: the step's best current framing (arrive, done-N★, or blocked). The contextual tips are `POST /program/tip`'s job. |

**Double-count rule.** Callers pass `facts.programXp` **excluding** the step
being evaluated; the response's `programXp` includes it. Re-evaluating the same
facts with `programXp := response.programXp` and adding the response's `xp`
again is the caller's bug — Node stores `StepStars[step]` and computes the sum
once. For the `level1` step, `xp` is 0 and `programXp` is returned unchanged
(capped at 54).

---

## 4. `POST /program/next`

Request (`ProgramNextRequest`):

```json
{ "step": "manager", "facts": { "...StepFacts...": "..." } }
```

`step` must equal `facts.step`.

Response 200 (`ProgramNextResponse`):

```json
{ "step": "manager", "completed": true, "nextStep": "players" }
```

- `nextStep` is `step` when the predicate fails, the following active step when
  it holds (`manager → players → facilities → level1 → done`), and `done` for
  `step: "done"`.
- `completed` mirrors `POST /program/evaluate`'s `completed`.

---

## 5. Step predicates and stars (normative)

`stars` is the highest clause that holds; clauses are cumulative.
`xp` is the reward of the achieved star.

### 5.1 `manager`

| | Predicate |
| --- | --- |
| completed | `manager != null` **and** `manager.contractYears > 0` |
| ★1 | completed |
| ★2 | completed **and** (`manager.overall ≥ 55` **or** `manager.signingFee ≤ 0.40 * startingBalance`) |
| ★3 | completed **and** `manager.overall ≥ 60` **and** `manager.signingFee ≤ 0.40 * startingBalance` **and** `budget ≥ 400000` |

### 5.2 `players`

| | Predicate |
| --- | --- |
| completed | `squad.total ≥ 11` **and** `squad.gk ≥ 1` |
| ★1 | completed |
| ★2 | completed **and** `squad.gk ≥ 2` **and** `squad.def ≥ 4` **and** `squad.mid ≥ 4` **and** `squad.att ≥ 3` |
| ★3 | ★2 **and** `squad.medianRating ≥ 55` **and** `budget ≥ 100000` |

### 5.3 `facilities`

| | Predicate |
| --- | --- |
| completed | ∃ asset with `tier ≥ 1` **and** `upgradingTo == null` |
| ★1 | completed |
| ★2 | completed **and** ∃ such asset with `type ∈ {training_ground, stands, medical_centre}` |
| ★3 | ★2 **and** `budget ≥ 200000` **and** ∃ such asset with `hasEffect == true` |

### 5.4 `level1`

| | Predicate |
| --- | --- |
| completed | `clubXp ≥ 100` (equivalently `levelForXp(clubXp) ≥ 1`, `level.ts:10`) |
| ★1 | completed |
| ★2 | completed **and** `programXp ≥ 27` |
| ★3 | completed **and** `programXp ≥ 54` **and** `friendlies.wins ≥ 2` |

`level1` pays 0 program XP; its `rewards` are all 0. Its predicate is a
threshold, never a deadline.

### 5.5 Reward table (normative)

`REWARD_XP = { 1: 3, 2: 9, 3: 18 }`, `PROGRAM_XP_CAP = 54`,
`LEVEL1_XP = 100`, `MATCH_XP = { win: 30, draw: 10, loss: 5 }`.

---

## 6. `POST /program/tip`

Return the single highest-priority eligible advisor line (spec §5.3). Pure: the
caller supplies the advisor state and the clock.

Request (`ProgramTipRequest`):

```json
{
  "facts": { "...StepFacts...": "..." },
  "advisor": {
    "shows": { "step.players.keeper": 2 },
    "lastShownAt": { "step.players.keeper": 1759800000000 },
    "dismissed": ["tip.idle.break"],
    "quiet": false
  },
  "now": 1759800060000
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `facts` | `StepFacts` | Same snapshot as evaluate. |
| `advisor.shows` | `{ [ruleId]: int }` | Times each rule has shown. Missing = 0. |
| `advisor.lastShownAt` | `{ [ruleId]: int }` | Epoch milliseconds of the last show. Missing = never. |
| `advisor.dismissed` | string[] | Rule ids dismissed by the owner (permanent until re-armed). |
| `advisor.quiet` | bool | The "quiet tips" toggle. Program-step and blocked lines still show; tips stay silent (spec §5.5). |
| `now` | int | Epoch milliseconds. Cooldown is `now - lastShownAt ≥ cooldownSeconds*1000`. |

Response 200 (`ProgramTipResponse`):

```json
{ "tip": { "...AdvisorLine...": "..." } }
```

`tip` is null when no rule is eligible.

**Selection (deterministic):** filter to rules whose trigger holds, that are not
dismissed, whose `shows < maxShows` (unless `maxShows == 0`, meaning unlimited),
whose cooldown has elapsed, and that survive the quiet filter. Sort by
`priority` desc, then `id` asc; return the first. Rules flagged `once` are also
suppressed when their id is in `advisor.shows` with any count.

**Quiet filter:** when `advisor.quiet` is true, rules whose priority is below 70
(the program-step band, §5.3 of the advisor spec) are suppressed. Blocked/urgent
lines (priority ≥ 90) and program-step lines (70–89) still show.

## 7. Tip rules (normative)

Priorities, cooldown/max and expressions are from `ADVISOR-SPEC.md` §5.2–§5.4.
`expr` is the line's expression; `pose`/`target` are fixed per rule.

### 7.1 Balance reveal

| id | Trigger | Priority | Max / cooldown | Points | Expr |
| --- | --- | --- | --- | --- | --- |
| `balance.reveal` | `step == "manager"` and `manager == null` and `assets` empty and `squad.total == 0` | 85 | once | — | `excited` if `startingBalance ≥ 4_000_000`, `worried` if `startingBalance ≤ 1_500_000`, else `neutral` |

### 7.2 Step beats

`arrive` priority 80, `nudge` priority 72 (cooldown ≥ 120s, maxShows 1),
`done.N` priority 82, `blocked` priority 92. `done.N` carries the expression
from the spec (happy / happy / excited for manager, players, facilities;
happy / excited / excited for level1). Only the `done.N` matching the achieved
star (or `arrive` when not complete) is returned.

| id | Trigger |
| --- | --- |
| `step.manager.arrive` | `step == "manager"`, `manager == null` |
| `step.manager.nudge` | `step == "manager"`, `manager == null` (cooldown-gated; only one of arrive/nudge is eligible) |
| `step.manager.done.1/2/3` | `step == "manager"`, evaluate stars == N |
| `step.manager.blocked` | `step == "manager"`, `budget < 40000` |
| `step.players.arrive` | `step == "players"`, predicate false |
| `step.players.nudge` | `step == "players"`, `squad.total < 11` |
| `step.players.done.1/2/3` | `step == "players"`, evaluate stars == N |
| `step.players.blocked` | `step == "players"`, predicate false, `budget < 220000` |
| `step.facilities.arrive` | `step == "facilities"`, predicate false |
| `step.facilities.nudge` | `step == "facilities"`, no `stands` Tier ≥ 1 |
| `step.facilities.done.1/2/3` | `step == "facilities"`, evaluate stars == N |
| `step.facilities.blocked` | `step == "facilities"`, `budget < 200000` |
| `step.level1.arrive` | `step == "level1"`, predicate false |
| `step.level1.nudge` | `step == "level1"`, predicate false, `clubXp ≥ 70` |
| `step.level1.done.1/2/3` | `step == "level1"`, evaluate stars == N |
| `step.level1.blocked` | `step == "level1"`, predicate false, `friendlies.losses > friendlies.wins` |

### 7.3 Contextual tips (spec §5.4)

| id | Trigger | Priority | Cooldown / Max | Dismiss | Points | Expr |
| --- | --- | --- | --- | --- | --- | --- |
| `tip.manager.scout` | `step == "manager"`, `manager == null`, `managersBrowsed ≥ 3` | 55 | 90s / 2 | yes | — | `thinking` |
| `tip.manager.wage` | `manager != null`, `manager.wage > 0.40 * startingBalance` | 60 | once / 1 | yes | — | `worried` |
| `tip.squad.keeper` | `step == "players"`, `squad.total ≥ 11`, `squad.gk == 0` | 95 | 30s / 3 | no | — | `worried` |
| `tip.squad.afford` | `step == "players"`, `budget < 220000` | 98 | 30s / 3 | no | — | `worried` |
| `tip.facility.stand` | `step == "facilities"`, no `stands` Tier ≥ 1 | 55 | 120s / 2 | yes | `stands` | `neutral` |
| `tip.facility.cheap` | `step == "facilities"`, `budget < 200000` | 90 | 60s / 2 | yes | — | `worried` |
| `tip.level.training` | `step == "level1"`, `clubXp ≥ 70`, no `training_ground` Tier ≥ 1 | 50 | 300s / 1 | yes | `staff_house` | `thinking` |
| `tip.play.gate` | `events.playBlocked == true` | 100 | once / 5 | no | — | `worried` |
| `tip.recovery.board` | `budget < 50000` | 96 | 120s / 2 | no | — | `worried` |
| `tip.milestone.manager` | `manager != null` | 45 | once / 1 | yes | — | `happy` |
| `tip.idle.break` | `events.sessionMinutes ≥ 90` | 15 | once / 1 | yes | — | `neutral` |
| `tip.veteran.quiet` | `events.programCompletedOnce == true` | 30 | once / 1 | yes | — | `neutral` |

`maxShows == 0` means unlimited. `once` means `maxShows == 1` and the rule is
also suppressed once it appears in `advisor.shows`.

The full rendered `text` for every id lives in Go (`tips.go`) and is returned on
the wire; 2B/2C never re-author it. Money in `text` is Villa (`V1.5M` /
`V1,500,000`, D2).

---

## 8. `POST /program/simulate`

The balance simulator (`OWNER-PROGRAM-SPEC.md` §14, R13). Deterministic per
`seed`; the match-outcome distribution is sampled from `sim-lab` output (§8.4),
never invented.

Request (`ProgramSimulateRequest`):

```json
{ "balance": 1000000, "strategy": "balanced_expert", "runs": 1000, "seed": 42 }
```

| Field | Type | Constraint |
| --- | --- | --- |
| `balance` | number | `1_000_000 ≤ balance ≤ 5_000_000` |
| `strategy` | enum | `random`, `facilities_first`, `splurge_on_manager`, `all_in_on_players`, `balanced_expert` |
| `runs` | int | `1 ≤ runs ≤ 100_000` |
| `seed` | int | 64-bit seed; any value |

Response 200 (`ProgramSimulationReport`):

```json
{
  "balance": 1000000,
  "strategy": "balanced_expert",
  "runs": 1000,
  "seed": 42,
  "timeToLevel1Minutes": { "p10": 55, "median": 64, "p90": 80, "mean": 65.2 },
  "matches": { "p10": 2, "median": 2, "p90": 4, "mean": 2.6 },
  "starDistribution": { "0": 0, "1": 0, "2": 120, "3": 880 },
  "finalSquadRating": { "p10": 53, "median": 56, "p90": 58 },
  "finalCash": { "p10": 105000, "median": 150000, "p90": 300000 },
  "finalTiers": {
    "stadium_grounds": 0, "stands": 0, "training_ground": 1,
    "youth_academy": 0, "scouting": 0, "medical_centre": 0, "staff_house": 0
  },
  "bankrupt": 0,
  "recovery": 0,
  "softLocked": 0,
  "histogram": [ { "bucket": "0-30", "count": 0 }, { "bucket": "30-45", "count": 0 } ]
}
```

| Field | Meaning |
| --- | --- |
| `timeToLevel1Minutes.*` | Distribution of simulated wall-clock minutes to `clubXp ≥ 100` (the session model, §8.3). Runs that never reach Level 1 are excluded from this distribution **and counted in `softLocked`**. |
| `matches.*` | Qualifying friendlies played. |
| `starDistribution` | Count of runs by the final program star total (sum of step stars, 0–12; key is the integer as a string). |
| `finalSquadRating.*` | Median XI `Rating` at Level 1. |
| `finalCash.*` | Cash at Level 1. |
| `finalTiers` | Median completed Tier per facility type across runs (integer floor). |
| `bankrupt` | Runs whose `budget` reached ≤ 0 at any point. |
| `recovery` | Runs that used a recovery action (board advance or a sale). |
| `softLocked` | Runs that failed to reach Level 1 within the run cap (§8.3). |
| `histogram` | Time-to-Level-1 histogram, 15-minute buckets from 0 to 240, then a final `240+` bucket. |

### 8.1 Cost and reward tables (normative)

The simulator uses the **real spec tables**, not approximations:

- Free-agent value: `round(PRICE[band(rating)] * AGE_MULT[band(age)])` and
  `wage = round(value * 0.15)` (spec §5.2). Bands are the spec's.
- Manager fee: `FEE[band(overall)]`, `wage = round(fee * 0.05)` (spec §5.3);
  interview discount 10% at `INTERVIEW_FEE = 25_000`.
- Facility Tier-1 cost is `upgradeCost(type, 1) = baseCost` (spec §5.4).
- Program XP `{1:3,2:9,3:18}`, cap 54; match XP `{win:30,draw:10,loss:5}`;
  `LEVEL1_XP = 100` (spec §3.2).
- Pool histograms (rating, age, position, manager overall) are the spec's §6.1.
- Pre-league income: shop takings and friendly cash as spec §5.5.
- Board advance: +V250,000 for a V50,000 fee (spec §15 Q4; the recovery path).

### 8.2 Star evaluation inside the simulator

The simulator calls the same `Evaluate` step functions (§5), so a reported star
total is the one the live game would give for that build.

### 8.3 Time model (documented, tunable)

`OWNER-PROGRAM-SPEC.md` §3.3 gives a session target (expert 45–90 min) and a
machine floor (build + cooldowns ≈ 30 min). The simulator reports a **session
time** = the machine time plus the owner's interaction budget:

```
time = interactionMinutes(manager + players + facilities)
     + max(facilityBuildMinutes, (matches-1) * MATCH_COOLDOWN_MINUTES)
     + sum(matchWatchMinutes)
     + recoveryMinutes
```

Constants: `MATCH_COOLDOWN_MINUTES = 5`, `MATCH_WATCH_MINUTES = 2`,
`MANAGER_INTERACTION_MINUTES = 12`, `PLAYERS_INTERACTION_MINUTES = 20`,
`FACILITIES_INTERACTION_MINUTES = 8`, `RECOVERY_MINUTES = 60`. Facility build
minutes are `upgradeMinutes(type, 1)`. The run cap is `60` matches; a run over
the cap is `softLocked`. These are the 4A tuning knobs and are named constants
in `sim/sim.go`.

### 8.4 Match-outcome model (provenance)

Quoting the `sim-lab` runs committed in
`services/world-service/internal/program/sim/testdata/`:

`sim-lab.exe 10000 realism` (the owner is always home, `play.service.ts:296`):
```
goals 2.69 | xG 3.27 | shots 23.3 | on target 7.9
home W/D/L 44/24/31 [45/25/30]
```

`sim-lab.exe 10000 quality`:
```
gap  0-3  :  4984 matches | stronger wins  34% draw  35% upset  30%  [~even]
gap  3-8  :  1827 matches | stronger wins  56% draw  27% upset  17%  [50-60%]
gap  8-15 :  1159 matches | stronger wins  83% draw  12% upset   5%  [65-75%]
gap 15-100:  2030 matches | stronger wins  96% draw   3% upset   1%  [80-90%]
```

The simulator maps `gap = ownXI − opponentXI` to `(pWin, pDraw, pLoss)` by
linear interpolation between `(0.0, 0.44/0.24/0.31)` (the home-even realism
baseline, since the owner is always home), `(5.5, 0.56/0.27/0.17)`,
`(11.5, 0.83/0.12/0.05)` and `(20.0, 0.96/0.03/0.01)`, mirroring the table
when the gap is negative. `opponentXI` is drawn from closest-power matchmaking
(`play.service.ts:202-217`: the 5 clubs nearest the club's own Rating), i.e.
near the club's own XI rating with a small spread (`N(0,2)`, clamped 40–90).
A regression test pins the band values.

---

## 9. Validation and errors

All Go handlers validate before doing any work and answer `400` with
`{ "error": string }`:

- `POST /program/evaluate`, `/program/next`: `step` missing/unknown, or
  `step != facts.step`, or a `facts` field out of range (negative counts) → 400.
- `POST /program/tip`: `now` missing/≤ 0, or a malformed `advisor` map → 400.
- `POST /program/simulate`: missing/out-of-range `balance` or `runs`, or an
  unknown `strategy` → 400.
- A body over 1 MiB or invalid JSON → 400 (`decodeJSON`).
- Anything unexpected → 500 `{ "error": "<what> failed" }`.

## 10. Ownership (R11)

| Owner | Files |
| --- | --- |
| **2A** | `services/world-service/internal/program/**` (steps, stars, rewards, tips, sim), `services/world-service/internal/http/server.go` (+ `_test.go`), `services/world-service/cmd/world-service/main.go`, `packages/api-contract/src/schemas/program-service.ts`, the program exports in `packages/api-contract/src/index.ts`, this document |
| **2B** | `apps/fs-pro-server/src/db/drizzle/migrations/0042_*.sql`, `schema.ts`, `services/world/club-founding.service.ts`, `services/program/**`, `services/world/level-change.ts`, `packages/api-contract/src/routes/program.ts`, `packages/api-contract/src/schemas/program.ts`, `route-policy.ts` |
| **2C** | `services/world/world-seed.service.ts`, markets, economy, Villa formatter |

`packages/api-contract/src/index.ts` is touched by 2A (the Go-boundary exports)
and 2B (the route/schema exports); the lead merges the two edits. Go never
writes money or XP.
