# OWNER-PROGRAM-SPEC.md — phase 2, Batch 1, Agent 1A

**Status:** DRAFT — for lead approval in `DECISIONS.md` before Batch 2 (FOR-AGENTS §4/B1). No feature code was written. This spec is the contract Batch 2 implements: 2A (Go `internal/program`), 2B (Node migrations/founding/manager market/gate/level seam), 2C (world seed, market, economy, Villa).
**Owner brief:** `INSTRUCTIONS.md` (P1–P7). **Program of record:** `FOR-AGENTS.md` (R1′–R14, P1–P7, L1–L13).
**Inputs read:** `AUDIT.md`, `RESEARCH.md`, `DECISIONS.md`, `BASELINE.md`, `PROGRESS.md`, `docs/cultures/STARTER.md`, plus the source files cited below.
**Convention:** paths are repo-relative. Server code lives under `apps/fs-pro-server/src/`; the docs cite it without the prefix (`services/play/play.service.ts:49` = `apps/fs-pro-server/src/services/play/play.service.ts:49`), matching `AUDIT.md` §Method.

---

## 0. Reconciliation with AUDIT.md (read this first)

`AUDIT.md` was written against a snapshot in which phase-1 Batch 4 had not shipped its culture work. **The actual tree this spec was written against already contains it.** Commit `e6f1d93` ("feat(cultures): culture-keyed worldgen banks for 8 cultures + mix-aware names (B4)") is in the history of `p2/integration` (`git log --oneline -15` → `eb04591`, `0115d4f`, `172878e`, …, `e6f1d93`). Concretely today:

- `services/worldgen/names/data/cultures/` holds **8** culture banks (`hunterlaan, inga, karsh, kev, kiyoto, legardio, pregge, proland`) — refutes AUDIT §1/L12 ("worldgen has only two banks").
- `services/worldgen/names/culture.go:174-186` defines kinds `first, last, full, club, region, city, district, stadium`; `GenerateKind` (`culture.go:348`), `GenerateUnique` (`:397`) and `GenerateMixed` (`:442`) exist.
- `services/worldgen/names/data/misc/country_cultures.json` holds the 11 countries with culture + weighted `mix` + aliases, including the STARTER mixes.
- The worldgen HTTP surface is already served: `GET /cultures`, `POST /names/generate`, `POST /names/mixed`, `POST /names/family` (`services/worldgen/server/server.go:42-47`).

**Consequence for this spec:** L12's *naming* floors and the per-country mix already exist; the phase-2 work for 1C is finish/verify (deny-list, floors, collision report, retire the Node syllable tables), not build from zero. **The L5 world seed can call `POST /names/mixed` today.** Everything else AUDIT reports (no seed, no manager attributes, no pricing curve, localStorage steps, USD money) is still current and is what this spec designs. Where a claim below depends on the *pre-B4* state AUDIT described, it is marked.

---

## 1. Terms

| Term | Meaning |
| --- | --- |
| **Owner** | The human player (P1). Owns the club; never picks the XI. |
| **Program** | The server-side, per-club onboarding state machine (L8): `manager → players → facilities → level1 → done`. |
| **Step** | One node of the program; a small game with a decision, a predicate, stars, XP, an advisor frame. |
| **Stars** | 1–3 per completed step; **decision quality**, not completion (L6). |
| **Tier** | Facility grade only (R5′). The code still says `level`; new UI/docs say Tier. |
| **Villa (V)** | Display unit; 1 stored unit = V1 (L13, `DECISIONS.md` D2). |
| **Qualifying friendly** | A Level-0 `PLAY` match (`Type='friendly'`, `play.service.ts:302`). Wins pay XP (`play.service.ts:49`). |
| **Hidden fact** | A player/manager attribute not shown until scouted/interviewed at a cost (the difficulty lever — RESEARCH §1.4). |

---

## 2. Code map (every fact cited)

**Founding (L1).** `STARTING_BUDGET = 1_500_000` (`services/world/club-founding.service.ts:54`); owner inserted as manager (`:442-443`, `:469-480`); `Clubs.ManagerId` set (`:487`); 16-player `SQUAD_SHAPE` (`:59`), `createSquad` (`:199`) called at `:543`; `placeInPyramid` at founding (`:544`, import `:32`); welcome inbox row (`:564-577`).

**Level (L6).** `100 * level * level` curve (`services/world/level.ts:10`), `DEFAULT_LEVEL_THRESHOLDS[1] = 100` (`:12-15`); `levelForXp` (`:25`); `Clubs.XP` (`db/drizzle/schema.ts:209`). XP writes go through `setXp`/`addXp` (`services/world/level-change.ts:18,48`); the level-change seam is `changeLevel` (`:79`).

**PLAY (L5/L6).** `REWARD_XP = { win: 30, draw: 10, loss: 5 }` (`services/play/play.service.ts:49`); `MATCH_COOLDOWN_SECONDS = scaled(...300)` (`:36`); `homeRatingBonus` from pitch/coaching (`:286-289`); matchmade friendly `createFixture` (`:296-306`); `ensureDefaultLineup` no-ops under 11 (`services/play/default-lineup.ts:26`); PLAY gate today is only `canManageClub` (`controllers/play/play.router.ts:61-73`) + cooldown/opponent pool (`play.service.ts:258-270`) — **no manager or squad gate** (AUDIT §3).

**Manager (L4).** `Managers` table with `isEmployed`, `PreferredFormation`, `PreferredStyle` (`db/drizzle/schema.ts:126-142`); `ManagerInterface` has no rating/attributes/wage/fee/contract (`controllers/managers/manager.model.ts:1-21`); `resolveManagerTactic` reads only the two preferred fields (`controllers/managers/manager.service.ts:100-117`); it is the fallback for every kickoff (`jobs/buildSimulateMatchRequest.ts:51-54`); `hireManagerForClub` refuses when `ManagerId` set (`controllers/clubs/club.controller.ts:39-43`), `fireManagerFromClub` nulls it (`:80-115`). All 52 dev managers have null preferred fields (AUDIT §8).

**Plan effects (manager mapping target).** `planEffect` (`services/play/plan-effects.ts:101`), `PLAN_TUNING` (`:69-82`), `PlanEffect` (`:92-99`), `nudgeSkills` (`:142`), `applyPlanToClub` (`:157`), style counter-cycle (`:38-51`). `MatchPlan` shape lives in `packages/api-contract/src/schemas/match-plan.ts`.

**Facilities / Tier (R5′).** `ASSET_CONFIG` costs/growth/minutes (`services/facilities/asset-config.ts:64-153`); `upgradeCost` (`:160`), `upgradeMinutes` (`:167`); `MAX_ASSET_LEVEL=5` (`:23`), `MAX_CONCURRENT_UPGRADES=1` (`:26`); build prerequisites (`:84,105,126,149`); the race-safe debit `Budget >= cost` (`services/facilities/facilities.service.ts:194-199`). The `effectLabel` still says "level" (`asset-config.ts:150`).

**Market / economy.** `Players` columns (`schema.ts:491-548`: `Value:505`, `Wage:509`, `isSigned:519`, `isRetired:528`, `ClubId:539`, `MoraleValue:545`); `WAGE_RATIO = 0.15` and `calculatePlayerWage` (`utils/players.ts:46,48`); `ratingFactors` cliff at index 68 (`utils/player-factors.ts:1-13`: 67→710k, **68→1.2M**); `generatePlayer` (`utils/players.ts:426`); `newAttributeRatings` (`:379`). Free-agent stock today tops up **16** when `GK<2 || total<8` (`services/transfers/foreign-intake.service.ts:141-167`, condition `:158`); free agents purchase at full `Value` (`controllers/transfers/transfer.service.ts:61-66`) with a window gate (`:36`) and a **plain** debit (`:104`, no `Budget>=` guard); `deductWagesForYear` (`:175-206`); transfer window default **closed** (`schema.ts:282`). Shop rates `1,500 + 6*fans + 1*capacity`/hour, cap `6 + 2*standsTier` hours (`services/play/shop.ts:23-27,44-49`). Board budget request route listed at `middleware/route-policy.ts:85`.

**Program state today (L8).** Device-local steps `fspro_steps_<id>` (`views/game/club-game.vue:1038-1081`, key `:1045,1056`); standing goal is `ClubChallenges` (`schema.ts:892-915`).

**Boundary (R3′).** world-service HTTP routes (`services/world-service/internal/http/server.go:109-118`), wired in `cmd/world-service/main.go:51-57`; Node talks to it only via `services/world/world-service.client.ts` (`:43-47` base URL, `call` `:55`). route-policy table (`middleware/route-policy.ts:42-150`); `program.*` will be added there. ts-rest contract root (`packages/api-contract/src/index.ts:32-53`).

---

## 3. The program model

### 3.1 State machine

Per club, server-side, one row in `OwnerProgram` (schema in §8). `Step` is a text enum:

```
not_started → manager → players → facilities → level1 → done
```

- **`not_started`** for a club founded after the migration. Set by founding (L1).
- **`done`** for every club that existed before the migration (L3 backfill), and for a new club when Level 1 is reached.
- Only the program advances a step; predicates are evaluated on every read (`GET /program/:clubId`) and every relevant mutation, never only on a button. The button (`POST /program/:clubId/advance`) exists so the client can re-check after the player's action.

**Step order is strict for *guidance*, not for *actions*.** The advisor frames one step at a time (RESEARCH §1.2), but the owner may always: play qualifying friendlies (gated only by manager + legal squad, §7), and spend money in the shared market. This is the recovery path (L7) — a broke owner plays friendlies for gate money and finishes the facility step later.

### 3.2 Step table (the implementation contract)

| # | Step | Predicate (`completed`) | Stars 1–3 predicate | Program XP |
| --- | --- | --- | --- | --- |
| 0 | **Balance reveal** | implicit at `not_started → manager` | (no stars) | 0 |
| 1 | `manager` | `Clubs.ManagerId != null` **and** the manager's `ContractYears > 0` | ★1 any hire; ★2 `Overall ≥ 55` **or** fee ≤ 40% of `PlayerBudget`; ★3 `Overall ≥ 60` **and** fee ≤ 40% and at least **V400k** remains after the hire | `{1:3, 2:9, 3:18}` |
| 2 | `players` | signed, non-retired players ≥ 11 **and** GK ≥ 1 | ★1 legal XI; ★2 legal XI **and** shape-balanced (≥2 GK, ≥4 DEF, ≥4 MID, ≥3 ATT); ★3 ★2 **and** median XI Rating ≥ 55 **and** ≥ V100k cash remains | `{1:3, 2:9, 3:18}` |
| 3 | `facilities` | ≥1 `ClubAssets` with `Level ≥ 1` **and** `UpgradingTo IS NULL` | ★1 any Tier-1; ★2 Tier-1 chosen from {`training_ground`, `stands`, `medical_centre`}; ★3 ★2 **and** ≥ V200k cash remains **and** the asset has a non-zero `effects()` value | `{1:3, 2:9, 3:18}` |
| 4 | `level1` | `levelForXp(Clubs.XP) ≥ 1` (i.e. `XP ≥ 100`, `level.ts:10`) | ★1 reached; ★2 program XP ≥ 27 (avg ≥2★); ★3 program XP ≥ 54 (3★ every step **and** ≥2 clean wins) | 0 (the goal itself) |

`stars` are stored per step in `OwnerProgram.StepStars` (`{step: 1|2|3}`). Program XP is the sum, **capped at 54** (`OwnerProgram.ProgramXp`). The cap matters: it stops a 3★ build from trivially coasting (L6) while keeping the program meaningful.

**XP budget (L6):** `100` XP to Level 1. Program max `54`; the remaining `≥46` **must** come from winning qualifying friendlies (`REWARD_XP.win = 30`). Table:

| Build | Program XP | Wins needed to reach 100 | Notes |
| --- | --- | --- | --- |
| 3★ all steps | 54 | **2** (54+60=114) | expert |
| 2★ all steps | 27 | **3** (27+90=117) | competent |
| 1★ all steps | 9 | **3** (9+90=99 → 4th win) | careless; draws/losses push it further |
| any | — | losses add 5, draws 10 | a losing build takes many more |

A 1★ build needs a 4th win (99 < 100); with one draw mixed in it is 5+ matches. This is the tested spread (§12, R13): expert 2 wins, naive 4+.

### 3.3 Time-to-league targets

At `GAME_TIME_SCALE=1` (`services/play/game-time.ts:7`): `MATCH_COOLDOWN_SECONDS = 300` (`play.service.ts:36`). First Tier-1 build is 20–40 real minutes (`asset-config.ts:71,83,93,104,115,124,147`, `upgradeMinutes` `:167`). Target:

- **Balanced expert (V1M):** Level 1 inside **one session (~45–90 min)**: hire + 14 players + one Tier-1, then 2 friendlies (≥10 min cooldowns) overlapping the build timer.
- **Naive owner:** clearly longer — ≥4 friendlies, a recovery event (board advance or a cheaper re-shop), and often a second session; target **≥2×** the expert's median (FOR-AGENTS B4/4A, L7).
- **Absolute floor:** the build timer (20 min) + 2 cooldowns (10 min) ≈ 30 min.

### 3.4 Where the logic lives (R3′)

- Go `services/world-service/internal/program` = **pure**: step table, predicates, star scoring, reward tables, tip rules, balance simulator. Table-tested, served at `/program/*`, no DB writes.
- Node = the state + every money/DB write: reads facts (players/assets/budget/XP), calls Go `POST /program/evaluate`, then writes `OwnerProgram` and the existing ledgers in a transaction.
- No Rust change (§6.4).

---

## 4. The steps as small games

For each step: **decision**, **known vs hidden**, **trade-offs**, **stars**, **failure/recovery**, **advisor frame**. Advisor copy here is framing only; the full cadence/cooldowns live in `ADVISOR-SPEC.md` (1B). Money in all lines is Villa (L13).

### Step 0 — The balance reveal (part of `not_started → manager`)

- **Decision:** none yet. The drawn V1M–V5M is the first "wow" (RESEARCH §3.2). Show it as a count-up with the advisor's reaction.
- **Known vs hidden:** the exact balance is known; what it buys is hidden until the advisor's comparison line.
- **Advisor frames:**
  - V1M: *"We drew **V1.0M**. Enough for a manager, a hard-working squad and one good building — not all three done well. Choose."*
  - V3M: *"**V3.0M**. You can have two of the three done well. The third decides your season."*
  - V5M: *"**V5.0M** — the best draw on the board. Spend it like it's the last money you'll see; the league won't be gentle."*
- **Failure/recovery:** none (it is information).

### Step 1 — Sign a manager

- **Decision:** which of the free managers to sign; fee vs wage vs quality vs style/formation fit.
- **Known vs hidden:** every manager shows `Nationality`, `Age`, `PreferredStyle`, `PreferredFormation` and a **scouted range** (e.g. "Tactics 54–66"), never the true value. `POST /program/:clubId/managers/:id/interview` costs `INTERVIEW_FEE = 25_000` and reveals the four attributes exactly + a one-line trait note (RESEARCH §1.4: hidden info is where difficulty lives). An interviewed manager is cheaper to sign by `NEGOTIATION_BONUS = 10%` (the relationship), so the fee is a real trade-off, not a pure sink.
- **Trade-offs:** a 3★ manager (fee ~V600k–1.2M) leaves little for the squad at V1M; a cheap manager is 1★ but leaves the wad for players. Preferred style must match the owner's brief (the counter-cycle `plan-effects.ts:38-51`) or the squad's strength.
- **Stars:** see §3.2. `Overall` is the weighted attribute average (§6.1).
- **Failure/recovery:** the cheapest legal manager fee is `40_000`; a V1M owner can always afford one. If funds are below `40_000` (only possible after over-spending), the advisor surfaces the **board advance** (existing `transfers.requestBudgetIncrease`, `route-policy.ts:85`) before allowing a soft-lock — but note the manager step precedes spending, so this is reachable only via a bug; the balance sim asserts it (L7).
- **Advisor frames:**
  - arrival: *"Your first job is the man in the dugout. Watch their style — your brief only works if it fits."*
  - scout CTA: *"An interview costs V25k. It tells you exactly what you're buying. Skip it and you're guessing."*
  - after a 1★ hire: *"He'll do a job. He won't win you the league."*
  - after a 3★ hire: *"That's a manager who carries out a brief. Now build him a team."*

### Step 2 — Sign players

- **Decision:** assemble a legal, fit XI from the 5,000 free agents (and, later, bids) under the remaining balance — quality vs balance vs squad depth.
- **Known vs hidden:** the browse list shows `Age`, `Position`, `Value`/`Wage` and a **scouted range** for `Rating` and the two or three attributes that matter to the position. `POST /program/:clubId/players/:id/scout` costs `SCOUT_FEE = scaled(15_000)` and reveals exact attributes. **Rating is never revealed to Level-0 program clubs** — only the range — so the owner's read of the market is the skill (RESEARCH §1.4). The existing `transfers.scoutPlayerTransfer` (`route-policy.ts:84`) is the precedent to extend.
- **Trade-offs:** the classic trap — a marquee 70+ free agent (V1.6M+, `player-factors.ts:67-68`) eats the whole budget and leaves no legal XI. Cheap 50–58 rated players (V34k–V170k) win the step but lose early friendlies. The owner chooses where on the rating/price curve to sit.
- **Stars:** §3.2. The star predicate rewards *shape* and a cash buffer, not raw spend.
- **Failure/recovery:** the cheapest free agent is `MIN_FREE_AGENT_PRICE = 20_000`; 11 × 20k = 220k, so a legal XI is always affordable at any balance. If the owner overspends on one star and cannot reach 11, recovery = **sell the star on the transfer list** (`transfers.listPlayerForSale`, `route-policy.ts:83`) or a **board advance**. Both are simulated.
- **Advisor frames:**
  - arrival: *"Eleven bodies and a keeper before the gate opens. Scout before you sign — the range is not the truth."*
  - when GK=0 at 10 players: *"No keeper, no match. Sort the gloves first."*
  - when a big signing leaves < V220k: *"That's a marquee player and a thin squad. The league punishes thin."*
  - on completion 3★: *"Balanced, honest and paid for. That's how you survive year one."*

### Step 3 — Build facilities

- **Decision:** which Tier-1 to build with what is left; whether to build before or after banking a few friendlies.
- **Known vs hidden:** costs are public (`upgradeCost`, `asset-config.ts:160`); the owner can reveal what each Tier *does* via the existing effect labels (`effectLabel`, `:72-152`). Hidden: the **completion time** only shows after start, and the knock-on effect on training/morale is explained, not measured.
- **Trade-offs:** `training_ground` (V200k, +8% growth, `:96`) compounds the squad; `stands` (V300k, capacity, gate income, `:85`) compounds cash; `medical_centre` (V260k, recovery, `:130`) compounds the friendlies loop. `youth_academy` (V350k) and `staff_house` (V300k) are long-term and weakest at Level 0. Building *any* Tier-1 spends the buffer that protects against a bad friendly run.
- **Stars:** §3.2. Only prerequisites matter at Tier 1: the offsets all resolve to level ≥0, so nothing blocks the first build (`asset-config.ts:84,105,126,149`).
- **Failure/recovery:** if funds < V200k, the owner can **play qualifying friendlies first** (shop + gate income, `shop.ts:44-49`; match cash `play.service.ts:342-346`) and build later; or take a board advance. No soft-lock.
- **Advisor frames:**
  - arrival: *"Now build one thing that makes the next thing cheaper. Training if you'll buy young; Stands if you'll be broke."* (Avoids calling it Level — Tier only, R5′.)
  - on start: *"It'll be done in a few minutes. Go win some friendlies while the builders work."*
  - on complete 3★: *"Foundation laid and money left over. That's an owner's build."*

### Step 4 — Reach Level 1 → the league draw

- **Decision:** how to spend the friendlies/cooldowns and how to set the brief. It is the skill gate of the program.
- **Known vs hidden:** the XP bar is explicit (`xpIntoLevel`/`xpForNext`, `play.service.ts:116-117`); the opponent's power is shown (`OpponentOption.power`, `:220-236`). Hidden: the engine's exact outcome — the owner reads odds from the plan preview (`previewMatchPlan`, `play.router.ts:107`).
- **Trade-offs:** friendlies cost fitness/cooldown; a friendly win's cash is a share of gate (`play.service.ts:43-52`), so a Stadium-less club wins little cash but the XP that matters. The owner must resist over-training (`drills` costs fitness, `plan-effects.ts:110-118`).
- **Stars:** §3.2. Reaching Level 1 with a 3★ program is the "scripted large payoff" (RESEARCH §3.3).
- **Failure/recovery:** losing is not a dead end; each match still pays 5 XP and some gate. The board advance is always available. The predicate is a threshold, not a deadline.
- **The reveal (`level1 → done`):** at the XP threshold, the existing mid-season join fires for the first time (§7) and the client shows the draw: the `<Country> League`, the pool name, the pool's clubs and the first fixture. This is idempotent (advisory lock, `pyramid.service.ts:509`; already-entered guard `:513-520`).
- **Advisor frames:**
  - arrival: *"One hundred XP stands between you and a real league. Wins pay 30. You need them."*
  - after a loss: *"Five XP for turning up. The board's still open if you need money."*
  - on Level 1: *"Level 1. Your league has a name now — and so do your rivals."*

---

## 5. The Villa (V) economy

All figures are in Villa (1 stored unit = V1, L13, `DECISIONS.md` D2). Format: `V1.5M` for ≥ V1M, `V1,500,000` below (D2).

### 5.1 Starting balance (L1/P7)

`Clubs.Budget = draw ∈ {1_000_000 … 5_000_000}` uniform in V100k bands, drawn once at founding and **shown to the player** (step 0). Replaces the fixed `STARTING_BUDGET` (`club-founding.service.ts:54,492`) and the welcome line (`:572-573`). Uniform is the lead default (L1); the spec keeps it because the balance simulator (R13) must prove skill beats luck, and a uniform draw makes the comparison clean.

### 5.2 Player price and wage curve (NEW — the V1M fix)

**Problem (AUDIT §9.3):** free agents cost full `Value` (`transfer.service.ts:61-66`); the legacy curve cliffs at rating 68 → V1.2M (`player-factors.ts:1-13`), and the existing pool's median is V1.28M, so a V1M start cannot buy an XI.

**Fix (contained to the seed):** the world seed **sets `Players.Value` from a new explicit curve** for the 5,000 seeded free agents (existing club players keep their legacy Value; L3). `Wage = round(Value * WAGE_RATIO)`, `WAGE_RATIO = 0.15` (`utils/players.ts:46`). The existing purchase path works unchanged (`offer >= Value`, `transfer.service.ts:62`).

`freeAgentValue(rating, age) = round(PRICE[band(rating)] * AGE_MULT[band(age)])`

| Rating band | Base V | | Age band | × |
| --- | --- | --- | --- | --- |
| 45–49 | 25,000 | | ≤20 | 1.30 |
| 50–54 | 55,000 | | 21–24 | 1.20 |
| 55–59 | 120,000 | | 25–28 | 1.00 |
| 60–64 | 320,000 | | 29–31 | 0.75 |
| 65–69 | 750,000 | | 32–34 | 0.50 |
| 70–74 | 1,600,000 | | ≥35 | 0.30 |
| 75–79 | 3,200,000 | | | |
| 80–84 | 6,500,000 | | | |
| 85+ | 12,000,000 | | | |

Chosen so an XI of rating ≈52 (1 GK, 4 DEF, 4 MID, 2 ATT) costs ≈ V0.6M, and a single rating-72 striker costs ≈ V1.9M — the "worth saving for" rare free agent (L5). Wages: V22k player → V3.3k/year; an XI of rating-57 earns ≈ V200k/year, charged once per Year (`deductWagesForYear`, `transfer.service.ts:175`). Pre-league cash must cover it (§5.5).

### 5.3 Manager fee and wage curve (NEW, L4)

`managerOverall = round(0.40*Tactics + 0.20*Motivation + 0.25*Development + 0.15*Discipline)` (§6.1).

`managerFee = round(FEE[band(overall)])`; `managerWage = round(managerFee * 0.05)` per Year.

| Overall | Fee V | Wage V/yr |
| --- | --- | --- |
| 45–49 | 40,000 | 2,000 |
| 50–54 | 90,000 | 4,500 |
| 55–59 | 180,000 | 9,000 |
| 60–64 | 360,000 | 18,000 |
| 65–69 | 650,000 | 32,500 |
| 70–74 | 1,100,000 | 55,000 |
| 75+ | 2,000,000 | 100,000 |

Interview: `INTERVIEW_FEE = 25,000`; signing after interview gets `NEGOTIATION_BONUS = 10%` off the fee (net interview cost V25k − 0.10×fee — worth it above ~V250k fees).

### 5.4 Facility costs — Tiers, not Levels (R5′)

`upgradeCost(type, n)` (`asset-config.ts:160`) at the current growth. Tier 1–2, with Tier 2 shown so the owner can plan:

| Facility (Tier) | T1 cost / time | T2 cost / time |
| --- | --- | --- |
| Stadium Grounds | V250k / 20m | V600k / 40m |
| Stands | V300k / 30m | V750k / 60m |
| Training Ground | V200k / 20m | V460k / 40m |
| Youth Academy | V350k / 40m | V840k / 80m |
| Scouting | V220k / 25m | V506k / 50m |
| Medical Centre | V260k / 25m | V624k / 50m |
| Staff House | V300k / 35m | V750k / 70m |

Times are `baseMinutes * Tier` scaled by `GAME_TIME_SCALE` (`asset-config.ts:167-170`). All new UI strings must say **Tier**; the code identifiers (`baseCost`, `ClubAssets.Level`) are unchanged (R5′). `effectLabel` (`:150`) must be reworded to drop "level".

### 5.5 Pre-league income (what the owner earns before the league)

| Source | Formula | V1M example |
| --- | --- | --- |
| Shop takings | `1,500 + 6*fans + 1*capacity` per design hour, cap `(6 + 2*standsTier)` hours (`shop.ts:23-27,44-49`) | fans 150, capacity 1,000 → V3,400/h, V20,400 cap |
| Friendly cash | win = `max(50% * gateNet, 3,000)`, draw 10%, loss −15% (`play.service.ts:50-52,342-346`) | V3k–V15k/win at 150 fans |
| Board advance | existing budget increase, gated by `BoardConfidence` (`route-policy.ts:85`) | emergency only |
| No league prize money | the pyramid pays at year end (`world-competitions.service.ts:38-50`) | — |

Shop income alone funds the next Tier in a few hours; friendlies fund wages and buffer.

### 5.6 Three sample allocations (required by the brief)

Each is a legal, program-completing build. "Hurts" = the trade-off the simulator must show.

**A — V1.0M.**
| Item | Cost |
| --- | --- |
| Manager, 1★ (OVR 52) | V90k |
| 11 players, median rating 52 | ≈ V605k |
| Tier-1 Training Ground | V200k |
| **Left** | **≈ V105k** |
- **Hurts:** the squad is the weakest in its own pool; early friendlies are losses, so Level 1 takes 4+ wins. Balanced-expert play survives by *scouting* (spending V15k to avoid overpaying) and by using the shop/match income to buy a rating-60 player after two friendlies.

**B — V3.0M.**
| Item | Cost |
| --- | --- |
| Manager, 2★ (OVR 58) | V180k |
| 14 players, median rating 58 | ≈ V1.7M |
| Tier-1 Stands | V300k |
| Tier-1 Training Ground | V200k |
| **Left** | **≈ V620k** |
- **Hurts:** the strongest 1-step build but the least cash buffer; one injury or a missed scout and the owner cannot upgrade mid-season. It wins Level 1 fastest but arrives with the thinnest balance.

**C — V5.0M.**
| Item | Cost |
| --- | --- |
| Manager, 3★ (OVR 66) | V650k |
| 1 marquee attacker, rating 72, age 24 | ≈ V1.9M |
| 10 more players, median rating 54 | ≈ V650k |
| Tier-1 Stadium Grounds | V250k |
| **Left** | **≈ V1.55M** |
- **Hurts:** the most *tempting* build and the most fragile: 11 players where one is a star and ten are filler; a 3★ manager's style must fit the star or the plan misfires. A naive owner instead buys two marquee players and cannot afford 11 — the soft-lock the recovery path (§4 step 2) exists to catch. The expert banks the leftover V1.55M for a Tier-2 push after the league draw.

**Simulator acceptance (R13/§12):** at every starting balance, the balanced-expert strategy's median time-to-Level-1 is inside §3.3; every naive strategy (random, facilities-first, splurge-on-manager, all-in-on-players) is ≥2× slower **or** triggers recovery; 0 soft-locks; star rating correlates with speed.

---

## 6. World seed (L5)

`POST`-free, idempotent Node job `services/world/world-seed.service.ts` (new, owned by 2C), guarded by a `WorldSeed` row (`Key='free_agents_v1'`). It tops the pools **up to** 5,000 players and 1,000 managers, never duplicates. Runs on `fspro_scale_100k`; running it on dev `fspro` is a release step (PROGRESS §Environment).

### 6.1 Skill distributions (with histograms)

Seed generation uses **rejection sampling**: `generatePlayer` (`utils/players.ts:426`) is called with an attribute range from the target band; the loop retries (max 8) until the derived `Rating` (`:538`) lands in the band, else accepts the closest. The seeded RNG is deterministic per (seed, index).

**Free-agent players — target rating histogram (5,000):**
```
45-49 |████████████            12.0%   600
50-54 |██████████████████████  22.0%  1100
55-59 |█████████████████████████  26.0%  1300
60-64 |██████████████████      20.0%  1000
65-69 |██████████              12.0%   600
70-74 |█████                    5.0%   250
75-79 |██                       2.5%   125
80-84 |                         0.4%    20
85+   |                         0.1%     5
```
Mean ≈ 57.5; median Value ≈ V120k; 1.0% (50) at V3.2M+ are the "save for" targets.

**Managers — target overall histogram (1,000):**
```
45-49 |████████████              14%   140
50-54 |█████████████████████     24%   240
55-59 |████████████████████████  27%   270
60-64 |███████████████           17%   170
65-69 |██████████                11%   110
70-74 |█████                      5%    50
75+   |██                         2%    20
```
Mean ≈ 57. The step-1 "safest step" property (RESEARCH §1.2): 38% of managers are ≤ V180k, so a V1M owner always has a supervisor.

**Position:** GK 10%, DEF 34%, MID 34%, ATT 22% (→ ≈500 free-agent GKs, safely above the `GK<2` restock trigger `foreign-intake.service.ts:158`).

**Age histogram (both pools; managers offset +12 and clipped to 30–65):**
```
≤20   |██████████          12%
21-24 |████████████████    20%
25-28 |██████████████████  22%
29-31 |████████████        16%
32-34 |██████████          12%
35-36 |██████████          16%   (players; includes the retirement tail)
```
Mean ≈ 26 for players.

### 6.2 Nationality weights by culture

Weights come from the countries in `Places` (`Type='country'`; 11 rows per AUDIT §8) and the per-country culture mix already in `services/worldgen/names/data/misc/country_cultures.json` (read at run time via `POST /names/mixed`, `culture.go:442`). Allocation of the 5,000 players:

| Country | Weight | ≈ players | Culture mix (worldgen) |
| --- | --- | --- | --- |
| Bellean | 22 | 1,100 | karsh 60 / legardio 15 / inga 15 / kiyoto 10 |
| Kev | 20 | 1,000 | kev 90 / hunterlaan 10 |
| Ekhastan | 12 | 600 | karsh 70 / pregge 10 / kiyoto 10 / inga 10 |
| UPP (Palaba) | 12 | 600 | inga 85 / kiyoto 10 / karsh 5 |
| Ashter | 8 | 400 | karsh 80 / legardio 10 / inga 10 |
| Simeone | 8 | 400 | legardio 95 / karsh 5 |
| Kiyoto | 8 | 400 | kiyoto 95 / inga 5 |
| Hunteerland | 5 | 250 | hunterlaan 95 / kev 5 |
| Proland | 3 | 150 | proland 95 / kev 5 |
| Pregge | 1.5 | 75 | pregge 100 |
| Galli* | 0.5 | 25 | inga 100 |
| **Total** | **100** | **5,000** | |

\* STARTER names "The Republic of Galli" but it has no `Places` row (AUDIT §8); its 25 players' `NationalityId` falls back to the UPP row via `nationalityIdForCulture` (`services/nationality.ts:14-27`). 1C decides whether to add a Galli row; the seed is robust either way.

The seed calls worldgen **once per batch** (`POST /names/mixed` with `{ country, kind:"full", count }`), gets names + the culture histogram back (`server.go:104-108`), and stores `FirstName`/`LastName` from the mixed name. If worldgen is down, the fallback is the retired Node syllable table **logged, not silent** (L12).

### 6.3 Price/wage curves

As §5.2: `Value = freeAgentValue(Rating, Age)`, `Wage = round(Value * 0.15)`. Manager: §5.3.

### 6.4 Restock and expiry

- **Restock:** each successful founding adds `RESTOCK_PLAYERS = 6` free agents and `RESTOCK_MANAGERS = 1` manager to the **founding country's** pool, generated with the country's culture mix (the L5 default's "squad's worth / 1–2 managers", downsized so 10k foundings add ≤ 60k rows before expiry). Idempotency: restock is keyed by `ClubId` in the `WorldSeed`/`MarketRestock` ledger so a retried founding cannot double-add.
- **Expiry:** seeded/restocked free agents get `Players.FreeAgentSince = Calendar.CurrentDay`. At each year end (the existing `deductWagesForYear` seam, `transfer.service.ts:175`), unsigned players with `CurrentDay - FreeAgentSince >= FREE_AGENT_TTL_DAYS = 84` are marked `isRetired=true` (never deleted — the codebase's philosophy, `schema.ts:520-528`). Staggered `FreeAgentSince` at seed time (a hash of the player index) avoids a mass expiry cliff.
- **Bounded:** target steady state 2,000–8,000 free agents. Acceptance: after 10,000 foundings on `fspro_scale_100k`, the unsigned count stays in that band (2C test).
- **Contention (L5):** signing is one transaction with two conditional writes:
  ```sql
  UPDATE "Clubs" SET "Budget" = "Budget" - :price WHERE "_id" = :club AND "Budget" >= :price RETURNING "_id";
  UPDATE "Players" SET "isSigned"=true,"ClubId"=:club,"ClubCode"=:code WHERE "_id"=:player AND "isSigned"=false AND "isRetired"=false RETURNING "_id";
  ```
  Either returning 0 rows ⇒ roll back. A race test with two owners on one free agent asserts exactly one wins. This also fixes the existing race in `settleTransfer` (`transfer.service.ts:104`), where the debit has no `Budget>=` guard.
- **Squad gate (L5):** the seed does not guarantee a squad; PLAY refuses until `Clubs.ManagerId != null` **and** ≥11 signed non-retired players **and** GK ≥ 1 (the exact minimum; matches `default-lineup.ts:26`). Add `assertProgramPlayable(club)` at the top of `playMatch` (`play.service.ts:263`) and a typed error the client's advisor consumes.

### 6.5 World-seed idempotency & observability

`WorldSeed { Key PK, Version, AppliedAt }`; re-running counts existing unsigned players/managers and only tops up the difference. The 2C report pastes the histogram of the generated pool, the culture histogram from worldgen, the two counts (exactly 5,000 / 1,000 on a clean scratch DB), and the scale run.

---

## 7. Level 0 → 1, the pyramid trigger (L2)

- The program XP (§3.2) + qualifying-friendly XP (`REWARD_XP`, `play.service.ts:49`) raise `Clubs.XP` through `addXp`/`payClub` (`level-change.ts:48`, `rewards.ts:14-29`). `Level` stays derived (`level.ts:25`).
- **The trigger moves from founding to Level 1.** Today `placeInPyramid` is called during founding (`club-founding.service.ts:544`). In phase 2 it is called the first time `levelForXp(XP) >= 1`. The call site is the level-change seam: after `addXp` raises a club across the threshold, Node calls `placeInPyramid(clubId, AddressCountryId)` once (idempotent: advisory lock `pyramid.service.ts:509`, already-entered guard `:513-520`), then writes the program to `done`.
- The `WorldSeed`/program backfill marks existing clubs `done`, so they never re-join (L3).
- The year-end draw (`drawAllPyramids`, `world-competitions.service.ts:144`) includes only clubs at Level ≥ 1.
- The client "you've reached Level 1" moment reads the joined pool from the existing `getClubLeague` path (`play.service.ts:189`).

---

## 8. The manager model (L4)

### 8.1 Attributes & contract (new columns on `Managers`, `schema.ts:126`)

| Column | Type | Meaning |
| --- | --- | --- |
| `Tactics` | int | 40–90; quality of plan execution |
| `Motivation` | int | 40–90; team-talk/morale |
| `Development` | int | 40–90; training growth |
| `Discipline` | int | 40–90; fitness handling, card suppression |
| `Overall` | int | derived, cached |
| `Wage` | real | per Year |
| `SigningFee` | real | one-off |
| `ContractYears` | int | remaining |
| `ContractUntilYear` | int | `Calendars.CurrentYear + ContractYears` |

`managerOverall = round(0.40*Tactics + 0.20*Motivation + 0.25*Development + 0.15*Discipline)`.

### 8.2 Exact mapping (R3′) — all through existing inputs

1. **Plan quality (`Tactics`).** The engine already receives `formationName`/`styleName` and sliders via `planTactic` (`plan-effects.ts:53`) / `PlanTactic` (`:17`), and a club with no saved tactic falls back to the manager's preferred fields via `resolveManagerTactic` (`manager.service.ts:100`, `buildSimulateMatchRequest.ts:51-54`). A better manager improves the **outcome** of the owner's brief as a bounded skill nudge applied exactly like `homeRatingBonus`:
   ```
   managerSkill = clamp( (Tactics - 55)/100 * 4.0, -1.0, +2.0 )        // -1.0 .. +2.0
                  + styleFitBonus(manager.PreferredStyle, plan.style)     // counter-cycle, ±0.8
                  + formationFitBonus(manager.PreferredFormation, plan.formation) // ±0.5
   ```
   applied in `buildSimulateMatchRequest.ts:94` next to `homeRatingBonus`. `styleFitBonus` uses `styleMatchup`/`counterTo` (`plan-effects.ts:38-51`) so it can never promise something the engine doesn't do.
2. **Team talks (`Motivation`).** Feeds `PlanContext.morale` and the `demandMorale` gate (`PLAN_TUNING.demandMorale=58`, `plan-effects.ts:81`): a motivated manager raises the threshold pass rate, i.e. `demand` lands more often (`:126-134`).
3. **Training growth (`Development`).** Multiplies the points fed to `newAttributeRatings` (`utils/players.ts:379`): `points *= 0.80 + 0.40*(Development/100)`. Reuses the existing `trainingGrowthMultiplier` concept from `asset-config.ts:96`.
4. **Discipline (`Discipline`).** Small bounded reduction of the `starterFitness` cost of `drills` (`plan-effects.ts:113`) and of the club's foul/card pressure — implemented as a fraction of the existing per-player attribute path, not a new engine field.
5. **The owner's brief stays.** `Match prep` (`play.router.ts:103-107`) is unchanged; the manager is the executor. This preserves the CORE-LOOP skill layer (L4).

### 8.3 Rust sim-core (R3′)

**No change required.** Every effect above is expressed through `PlanEffect.skill`/`starterFitness` (`plan-effects.ts:92-99`), the existing formation/style strings (`PlanTactic`, `:17`), and Node-side training/morale. The engine's contract (`crates/sim-core contract.rs RawTactic`, quoted at `plan-effects.ts:15-16`) is untouched. Therefore **no sim-lab before/after tables are mandatory** (R3′). If 2A finds an effect that cannot be expressed, this spec must be amended and sim-lab re-run; that is not expected.

---

## 9. Data model, migrations, backfills (L3)

Migrations live in `apps/fs-pro-server/src/db/drizzle/migrations/` (last: `0041_clubs_district_index.sql`). File-per-migration, idempotent-guarded SQL, exactly like `0038_world_districts.sql`.

### 9.1 `0042_owner_program.sql`

```sql
-- Owner program state (L8), manager attributes (L4), free-agent market metadata (L5).
CREATE TABLE IF NOT EXISTS "OwnerProgram" (
  "ClubId" uuid PRIMARY KEY REFERENCES "Clubs"("_id"),
  "Step" text NOT NULL DEFAULT 'manager',
  "StepStars" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ProgramXp" integer NOT NULL DEFAULT 0,
  "Chapter" text,
  "ChapterData" jsonb,
  "DismissedTips" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "StartedAt" timestamp(3) NOT NULL DEFAULT now(),
  "CompletedAt" timestamp(3),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "OwnerProgram_step_idx" ON "OwnerProgram" ("Step");

ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Tactics" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Motivation" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Development" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Discipline" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Overall" integer;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "Wage" real;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "SigningFee" real;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "ContractYears" integer NOT NULL DEFAULT 0;
ALTER TABLE "Managers" ADD COLUMN IF NOT EXISTS "ContractUntilYear" integer;

ALTER TABLE "Players" ADD COLUMN IF NOT EXISTS "FreeAgentSince" integer;
CREATE INDEX IF NOT EXISTS "Players_free_agent_idx"
  ON "Players" ("isSigned", "isRetired") WHERE "isSigned" = false;

CREATE TABLE IF NOT EXISTS "WorldSeed" (
  "Key" text PRIMARY KEY,
  "Version" integer NOT NULL DEFAULT 1,
  "AppliedAt" timestamp(3) NOT NULL DEFAULT now()
);
```

### 9.2 `0043_places_culture.sql`

`Places.CultureId text` (the worldgen culture id — cultures are data in `services/worldgen`, not DB rows; L12). Backfill from `country_cultures.json`: a country's `CultureId` = its primary culture; a region/city/district inherits its country's. Null for rows with no country. (Owned by 1C/2B; repeated here because the seed and the manager/player names depend on it.)

### 9.3 Backfill (L3) — existing clubs unchanged

```sql
-- Existing clubs are already in a pyramid and have squads/managers: program complete.
INSERT INTO "OwnerProgram" ("ClubId","Step","CompletedAt","StartedAt")
SELECT c."_id", 'done', now(), coalesce(c."createdAt", now())
FROM "Clubs" c
ON CONFLICT ("ClubId") DO NOTHING;

-- Existing managers get deterministic attributes from their Key so the value is stable.
UPDATE "Managers" m SET
  "Tactics"      = coalesce(m."Tactics",      45 + (hashtext(m."Key" || 't') & 45)),
  "Motivation"   = coalesce(m."Motivation",   45 + (hashtext(m."Key" || 'm') & 45)),
  "Development"  = coalesce(m."Development",  45 + (hashtext(m."Key" || 'd') & 45)),
  "Discipline"   = coalesce(m."Discipline",   45 + (hashtext(m."Key" || 'x') & 45))
WHERE m."Tactics" IS NULL;
UPDATE "Managers" m SET "Overall" = round(0.40*m."Tactics"+0.20*m."Motivation"+0.25*m."Development"+0.15*m."Discipline")::int WHERE m."Overall" IS NULL;
```

Verification (2B): row counts of `Clubs`, `Entries`, `Players`, `Managers` before and after on a dev-schema copy are identical except the new columns/rows; `Clubs.ManagerId`, `Entries.Division` and every `Budget` are unchanged; `checkWorldPyramid.ts` green.

### 9.4 New-club founding (L1), exact delta to `club-founding.service.ts`

Remove: the manager insert (`:442-443`, `:469-480`, `:503`), `ManagerId` (`:487`), `createSquad` (`:543`), `placeInPyramid` (`:544`), the fixed `Budget` (`:492`). Add: `Budget = drawStartingBalance()` (uniform V1M–V5M), an `OwnerProgram` insert (`Step='manager'`), and a welcome message stating the drawn balance in Villa. Keep: placement of district/city/region/country (`openPlaces`), crest, campus, fans/reputation, news.

---

## 10. API (ts-rest + zod + route-policy)

### 10.1 Client-facing routes (Node, `packages/api-contract/src/routes/program.ts`, registered in `index.ts:32-53`)

| Method | Path | Purpose | Policy |
| --- | --- | --- | --- |
| GET | `/program/:clubId` | Program state: step, stars, XP, next predicate, advisor line, chapter | `{ club: param('clubId') }` |
| POST | `/program/:clubId/advance` | Re-check the predicate; advance one step if complete (idempotent) | `{ club: param('clubId') }` |
| POST | `/program/:clubId/tips/:tipId/dismiss` | Server-side tip dismissal (L9) | `{ club: param('clubId') }` |
| GET | `/program/:clubId/managers` | Browse the seeded manager pool, attributes masked to ranges | `{ club: param('clubId') }` |
| POST | `/program/:clubId/managers/:managerId/interview` | Pay `INTERVIEW_FEE`, reveal attributes, add the negotiation bonus | `{ club: param('clubId') }` |
| POST | `/program/:clubId/managers/:managerId/sign` | Negociate + sign (money write) | `{ club: param('clubId') }` |
| GET | `/program/:clubId/players` | Browse free agents, `Rating` masked | `{ club: param('clubId') }` |
| POST | `/program/:clubId/players/:playerId/scout` | Pay `SCOUT_FEE`, reveal attributes | `{ club: param('clubId') }` |
| POST | `/program/:clubId/players/:playerId/sign` | Sign a free agent (conditional writes, §6.4) | `{ club: param('clubId') }` |
| POST | `/program/:clubId/loan` | Board advance (thin wrapper over the existing budget request) | `{ club: param('clubId') }` |
| GET | `/program/:clubId/chapter` | Post-Level-1 chapter state (§11) | `{ club: param('clubId') }` |

Zod: `packages/api-contract/src/schemas/program.ts` (`OwnerProgramSchema`, `ProgramStepSchema = z.enum([...])`, `ProgramManagerSchema`, `ProgramPlayerSchema`, `AdvisorLineSchema`, `ChapterSchema`), exported from `index.ts` like the play schemas (`index.ts:67-79`). Money fields are plain numbers (Villa display is a client concern, L13). `route-policy.ts` gets a `program.*` block near the `play.*` block (`:93-101`).

### 10.2 Go boundary shapes (`packages/api-contract/src/schemas/program-service.ts`)

Mirrors the world-service pattern (`schemas/world-service.ts`, exported at `index.ts:164-201`), so a drifted Go response fails at the boundary:

| Method | Go path | Request | Response |
| --- | --- | --- | --- |
| GET | `/program/steps` | — | the step table (for tests/2A) |
| POST | `/program/evaluate` | `{ step, facts: StepFacts }` | `{ completed, stars, xp, reasons: string[], advisor: AdvisorLine[] }` |
| POST | `/program/next` | `{ step, facts }` | `{ nextStep }` |
| POST | `/program/tip` | `{ facts, dismissed: string[], now }` | `{ tip: AdvisorLine \| null }` |
| POST | `/program/simulate` | `{ balance, strategy, runs, seed }` | simulator report (2A, R13) |

`StepFacts` is the pure input set: squad counts by position, GK count, median rating, cash, assets with Tiers, program XP, manager overall, wins/draws/losses. **No DB, no money.** Node reads facts → calls Go → writes DB.

---

## 11. Go / Node boundary (R3′)

- **Go `services/world-service/internal/program`:** pure package (`program.go`, `steps.go`, `stars.go`, `rewards.go`, `tips.go`, `sim/`). New HTTP routes registered in `internal/http/server.go:109-118` and wired as a `Program` dependency in `cmd/world-service/main.go:51-57`, exactly like `Tiles`. Table tests per step, race tests, benchmarks, deterministic simulator per seed. It **never** touches `Clubs.Budget` or `XP`.
- **Node:** new `services/world/world-seed.service.ts`, `services/program/owner-program.service.ts` (state + stars + advisor line), `services/program/manager-market.service.ts`, `services/program/free-agent-market.service.ts`, and the gate in `services/play/play.service.ts`. All money/DB writes go through the existing transactional patterns (`settleTransfer`, `facilities.service.ts:194-199`, `payClub`). Node calls Go through `services/world/world-service.client.ts` (new `evaluateProgramStep`, `nextProgramStep`, `programTip`, `simulateProgram` functions, base URL `:43-47`).
- **worldgen (Go, 1C):** the seed uses `POST /names/mixed` (`server.go:45`, `culture.go:442`). Node retires `services/transfers/system-country-names.service.ts` and `utils/placeholder-names.ts` for new generation, fallback logged when worldgen is down (L12).

---

## 12. Post-Level-1 chapters (L8)

Server-side in `OwnerProgram.Chapter`/`ChapterData`; surfaced on the existing challenge card (`ClubChallenges`, `schema.ts:892`). Chapters are finite, meaningful completions (RESEARCH §2: no infinite grind).

| # | Chapter | Target (predicate) | Reward | Advisor |
| --- | --- | --- | --- | --- |
| 1 | **First season** | finish in the top half of your pool (existing `Entries.FinalPosition`/`FinishScore`) | XP + cash via the existing pyramid payouts (`world-competitions.service.ts:38-50`) | *"Top half of your pool. That's a real season."* |
| 2 | **Foundations** | first **Tier-2** facility complete | XP + a scouting shortlist refresh | *"Tier 2. Now the club grows while you sleep."* |
| 3 | **Name on the map** | reach Level 2 **or** win an Amateur Cup tie (`AMATEUR_CUP`, `world-competitions.service.ts:55`) | reputation/news + XP | *"People know the name now."* |

No timers beyond `GAME_TIME_SCALE` (R14); no streak punishment; dismissal is server-side (L9).

---

## 13. Document edits (quoted diffs)

### 13.1 `docs/WORLD-PYRAMID-SPEC.md` — "Joining mid-season" (`:227-238`)

```diff
 ### Joining mid-season
 
-When a club is founded in a country whose edition is running:
+When a club **reaches Level 1** (Phase 2: the owner program) in a country
+whose edition is running:
 
 1. Find the bottom division's pools that have an open slot. Prefer the pool whose clubs share the new club's region, then the pool with the most open slots.
 ...
-The same happens when a country's first club is founded: its pyramid competition is created and drawn on the spot, as a one-division edition.
+The same happens when a country's first club reaches Level 1: its pyramid
+competition is created and drawn on the spot, as a one-division edition.
+Founded clubs that have not reached Level 1 are not placed and have no
+fixtures; a club is placed exactly once (idempotent under the placement lock).
```

Also insert after "### Fill order" paragraph (`:70`):

```diff
 So the world grows from one place, and early players share towns.
+
+A club's **placement** (district/city/region/country) still happens at
+founding; only its **pyramid entry** waits for Level 1. It can play
+qualifying friendlies in the meantime (no league fixtures) once it has a
+manager and a legal squad.
```

### 13.2 `docs/CORE-LOOP.md` — "First session (onboarding)" (`:41-50`)

```diff
 ## First session (onboarding)
 
-1. The welcome card (inbox).
-2. First steps, with a pulsing pointer on the control each step needs (on phones only the current step shows):
-   1. **Collect your shop takings.** The till starts full, so the first tap pays.
-   2. **Play your first match.** A new club starts with an auto-picked XI, so PLAY is never blocked by an empty team sheet.
-   3. **Plan your next match.** The next-match chip opens Match prep.
-   4. **Build a facility.**
-   5. **Check your league.**
-3. After that, the challenge card takes over as the standing goal.
+1. The **balance reveal** (the advisor shows the drawn V1M–V5M).
+2. The **owner program**, one step at a time, server-side
+   (`docs/perfect/phase-2/OWNER-PROGRAM-SPEC.md`):
+   1. **Sign a manager.** Interview to reveal the hidden attributes (V25k).
+   2. **Sign players.** Scout free agents, then sign a legal XI
+      (11 including a keeper). PLAY is refused until the squad is legal.
+   3. **Build a facility** (Tier 1). The advisor points at the campus building.
+   4. **Reach Level 1.** Program XP (scaled 1–3 stars per step) plus wins in
+      qualifying friendlies. On Level 1 the game assigns a league.
+3. After the league draw, the **chapters** take over and feed the challenge card.
```

### 13.3 `docs/OPEN-PLAY-COMPETITIONS-SPEC.md` — "Human clubs" (`:552`)

```diff
 ## Human clubs
 
+- A brand-new club is **Level 0** and is a member of no competition until it
+  reaches Level 1 (the owner program assigns its pyramid league then). Before
+  that it may play qualifying friendlies only. Existing clubs are unaffected.
 - Browse competitions in registration they're eligible for and register (fee
   shown up front), or accept an invite. Same `MaxConcurrentEntries` cap as AI
   clubs. Registration is **blocked** if `Budget` is below the fee.
```

### 13.4 `CLAUDE.md` — key concepts (`:41-50`)

```diff
 - **Board** judges a club's performance score across all competitions,
   compared with the target for its Level.
+- **Owner program**: a new club's server-side onboarding
+  (`OwnerProgram`; `docs/perfect/phase-2/OWNER-PROGRAM-SPEC.md`): sign a
+  manager, sign a legal squad, build one facility, reach Level 1 — only then
+  is it assigned a league. The human is the **owner**, never the manager.
 - **Year = Season** (28 game days by default). Year end finishes the pyramid
   editions and draws the next ones, then runs ageing, wages, retirement,
   youth intake and reports. It creates no other competitions.
@@
-- **Placement**: new clubs fill the world in order: town, then region, then
-  country, then a new country. Invite links override this for a town. Never
-  spawn AI clubs on founding.
+- **Placement**: new clubs fill the world in order: district, then city, then
+  region, then a new country. Invite links override this. Placement happens at
+  founding; **pyramid entry waits for Level 1**. Never spawn AI clubs on founding.
```

---

## 14. Balance simulator contract (R13) and tests

**2A (`internal/program/sim`).** Seeded, deterministic. Strategies: `random`, `facilities_first`, `splurge_on_manager`, `all_in_on_players`, `balanced_expert`. Runs at V1M/V3M/V5M, ≥1,000 seeds each after tuning (4A). Uses the real cost/reward tables of this spec and match-outcome distributions sampled from sim-lab output — never invented. Outputs: time-to-Level-1 distribution, bankrupt/soft-locked count, final squad/Tier/cash.

**Acceptance (4A, `BALANCE.md`):**
1. `balanced_expert` median inside §3.3 at every balance.
2. Every naive strategy ≥2× slower **or** needs recovery.
3. `balanced_expert @ V1M` median < `random @ V5M` median (skill beats luck, L7).
4. 0 soft-locks at every balance (recovery reachable from any state).
5. Star rating correlates with time-to-Level-1 (Spearman > 0).

**Unit/table tests (2A Go):** one table test per step (predicate true/false, each star boundary), reward table test, tip priority/cooldown test, simulator determinism per seed, `go test -race`.
**Node tests (2B/2C):** migration backfill before/after counts; 50 racing level-ups → exactly one `Entries` row each; two owners racing a free agent → one winner; seed twice on a scratch DB → exactly 5,000/1,000 with histograms; founding benchmark within 10% of 31 ms/club on `fspro_scale_100k`; free-agent count after 10k foundings bounded.
**Client (3C):** Playwright desktop 1440×900 + mobile 390×844: register → found (balance reveal) → hire manager → sign squad → build → qualifying friendlies → Level 1 → league joined; cross-device program state.
**Villa (R4/L13):** `grep -rnE '\$|€|£'` used as money in client and server strings returns zero (command + output pasted).

---

## 15. Open questions for the lead (none block Batch 2)

| # | Question | This spec's assumption |
| --- | --- | --- |
| Q1 | AUDIT vs the shipped B4 culture work (§0): should 1C verify/extend rather than rebuild? | Yes — treat L12 as *verify + retire Node tables*. Record in `DECISIONS.md`. |
| Q2 | Does the program bypass the transfer window for Level-0 signings, or does the seed open the window? | Program-scoped signing through `settleTransfer` (window-free) with the conditional budget guard; the global window is untouched. |
| Q3 | Is `FreeAgentSince` on `Players` acceptable, or reuse `updatedAt`? | New column, for a clean TTL and a bounded pool. |
| Q4 | Board-advance cost (flat V50k + confidence) vs a loan ledger? | Reuse the existing budget request (`route-policy.ts:85`) with a V50k fee; 2C may tune. |
