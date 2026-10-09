# Phase 2 · Batch 0 · Agent 0B — Audit (READ-ONLY)

Scope: confirm/refute every code fact in `docs/perfect/phase-2/FOR-AGENTS.md` §2
(L1, L4–L6, L8, L12, L13) and map the areas listed in the Batch 0 brief. No code,
branch or worktree was created or changed. Every claim cites a file and line, or
a command and its output. Where a fact could not be established, it is listed as
such.

## Method, paths and environment

- **Path convention.** The docs cite server paths relative to the package source
  (`services/...`, `controllers/...`, `db/drizzle/schema.ts`). The real root is
  `apps/fs-pro-server/src/`. So `services/play/play.service.ts:49` in the docs is
  `apps/fs-pro-server/src/services/play/play.service.ts:49`. Client paths in the
  docs are already relative to `apps/fs-pro-client/src/`. All citations below give
  the real repo-relative path.
- **Commands run.** `psql` (read-only) against
  `postgresql://fspro:superpassword@localhost:5434/fspro`; `grep`/`sed`. No writes.
- **Dev DB caveat (established, important).** The `fspro` DB is **not** on the
  schema the current code expects:
  - `Places.Type` distinct values are `country`(11), `region`(4), `town`(24) —
    there is no `city` or `district` row.
  - `Clubs` has `TownId`, **no** `DistrictId`.
  - `PlaceStats`, `TileRevisions` and `PlaceInvites` do not exist (`TownInvites` does).
  - `drizzle.__drizzle_migrations` has 15 rows (max id 15); the repo has 42 SQL
    files through `0041_clubs_district_index.sql`, and `0041` documents the
    `0038_world_districts.sql` migration that renames `town`→`city` and adds
    `DistrictId`. So `0038` is not applied to `fspro`.
  - The current code writes `Type: 'district'` and `clubs.DistrictId`
    (`apps/fs-pro-server/src/services/world/club-founding.service.ts:372, 489`), so
    founding would fail against this DB as-is. Culture data read from `fspro`
    below is therefore the **old-hierarchy** world; sample names are still valid.

---

## 1. Confirm/refute the §2 code facts

### L1 — Founding (CONFIRMED, line numbers exact)

`apps/fs-pro-server/src/services/world/club-founding.service.ts`

- Fixed budget: line 54 `export const STARTING_BUDGET = 1_500_000;` — **confirmed**.
- Owner becomes manager: lines 442–443 take the owner's name and a manager key,
  lines 469–480 insert a `Managers` row for the owner, and line 487 sets
  `ManagerId: manager!.id` on the new club:

  ```
  442  const { id: managerKey } = await getNextCounterId('manager');
  443  const [first, ...rest] = tidyName(user.FullName || user.Username).split(' ');
  ...
  469  const [manager] = await tx.insert(managers).values({
  473    FirstName: first || user.Username,
  474    LastName: rest.join(' ') || 'Manager',
  475    Age: user.Age ?? 35,
  476    NationalityId: where.country.id,
  477    isEmployed: true,
  ...
  487    ManagerId: manager!.id,
  ```
  — **confirmed**.
- 16 amateurs via `createSquad`: line 59 `SQUAD_SHAPE` has 16 entries, line 199
  `async function createSquad(...)`, and line 543 calls it — **confirmed**.
- `placeInPyramid` at founding: line 544 — **confirmed**.

### L4 — Managers are real hires later (CONFIRMED for the existing schema)

`apps/fs-pro-server/src/db/drizzle/schema.ts:126`:

```
126  export const managers = pgTable('Managers', {
127    id: uuid('_id').primaryKey().defaultRandom(),
...
134    ClubId: uuid('ClubId').references((): AnyPgColumn => clubs.id),
135    PreferredFormation: text('PreferredFormation'),
136    PreferredStyle: text('PreferredStyle'),
140    isEmployed: boolean('isEmployed').notNull().default(false),
```

— `Managers` exists with `isEmployed` and preferred formation/style: **confirmed**.
- Existing manager → tactic input: `resolveManagerTactic` reads only
  `PreferredFormation`/`PreferredStyle`
  (`apps/fs-pro-server/src/controllers/managers/manager.service.ts:100-117, 95-98`).
  `buildSimulateMatchRequest` falls back to it when the club has no saved tactic
  (`apps/fs-pro-server/src/jobs/buildSimulateMatchRequest.ts:51-54`).
- The doc's added attributes, wage demand, signing fee and contract do **not**
  exist: `ManagerInterface` has no `Rating`, `Tactic`, wage, fee or contract
  (`apps/fs-pro-server/src/controllers/managers/manager.model.ts:1-21`) — these are
  the proposed change, not today's fact. `Clubs.ManagerId` (schema.ts:181) is the
  only club→manager link. **Confirmed as "not built".**

### L5 — Market is shared and seeded (REFUTED as a today fact; only a small top-up exists)

- There is **no** world-seed step for 5,000 players / 1,000 managers. The only
  stock function is
  `apps/fs-pro-server/src/services/transfers/foreign-intake.service.ts:141-167`
  `ensureFreeAgentMarketStock`, which replenishes only when free agents are
  already scarce:
  ```
  158  if (gkCount < 2 || totalCount < 8) {
  159    const recruits = await generateForeignLeagueIntake({ count: 16, ...
  ```
  — tops up by **16 players only**, no managers.
- Callers: `apps/fs-pro-server/src/services/transfers/transfer-window.service.ts:64`
  (on window open) and `apps/fs-pro-server/src/services/transfers/transfer-market.service.ts:472`
  (daily transfer tick).
- Managers are created only at founding (`club-founding.service.ts:469`) and by the
  admin `createManager` route (`apps/fs-pro-server/src/controllers/managers/manager.router.ts:183`).
  No seeding. Dev DB: `Managers` = 52 rows, `isEmployed=false` = 7, of which 3 have
  no `ClubId` (see §4).
- The cited conditional-update pattern exists: `apps/fs-pro-server/src/services/facilities/facilities.service.ts:194-199`
  (`.set(Budget - cost).where(Budget >= cost)`), matching the doc's line 196.
  **Confirmed.** Signing, however, does **not** yet use that pattern (see §4).
- "The club can't PLAY until it has a manager and a legal matchday squad" is a
  proposal; today PLAY has no such gate (§3).
- `createSquad` adding 16 is today's founding behaviour — **confirmed** (L1).

### L6 — Level 0→1 must be earned (CONFIRMED, exact)

- `apps/fs-pro-server/src/services/play/play.service.ts:49`:
  `const REWARD_XP = { win: 30, draw: 10, loss: 5 } as const;` — **confirmed**.
- Threshold: `apps/fs-pro-server/src/services/world/level.ts:10`
  `const curve = (level) => 100 * level * level;` → Level 1 = 100 XP
  (`DEFAULT_LEVEL_THRESHOLDS[1] = 100`, lines 12–15) — **confirmed**. 100/30 =
  3.33 → "about 4 wins" — **confirmed**.
- Program XP for steps and qualifying-friendlies XP do not exist today — proposal.

### L8 — Program state server-side (REFUTED as today; localStorage confirmed)

`apps/fs-pro-client/src/views/game/club-game.vue`:

```
1039  /** One-off onboarding steps done on this device, per club. */
1045    stepFlags.value = JSON.parse(localStorage.getItem(`fspro_steps_${id}`) || '{}');
1056    localStorage.setItem(`fspro_steps_${clubId.value}`, JSON.stringify(stepFlags.value));
```

The first-steps block is lines 1038–1081 (`firstSteps` computed at 1062–1079,
`coach` pointer at 1081). Key is exactly `fspro_steps_<id>` — **confirmed**. There
is no server-side program state; the challenge card (`ClubChallenges`) is the only
persistent standing goal. **Confirmed as "not built".**

### L12 — Cultures are data (CONFIRMED as today's facts)

- worldgen has **only two** banks, keyed by city/culture name:
  `services/worldgen/names/data/name_bank/bellean.json` and
  `.../kev.json`; arrangements only `bellean` and `kev`
  (`services/worldgen/names/data/misc/name_arrangements.json:2,15`). The generator
  returns **person names only** (`services/worldgen/names/generator.go:85-118`,
  `ReturnParts` f_l/f/l). — **confirmed**.
- Node syllable tables: `apps/fs-pro-server/src/services/transfers/system-country-names.service.ts:12-79`
  has keys `kev, bellean, kiyoto, simeone, hunteerland (misspelt), ekhastan, upp,
  ashter, legardio, pregge, proland`. The doc names five of these; the file has
  eleven. `hunteerland` is the misspelling of the country `Hunteerland`/culture
  `Hunterlaan` — **confirmed**.
- Country lookups: `apps/fs-pro-server/src/services/nationality.ts:14`
  `nationalityIdForCulture`, with legacy ids at lines 4–7 — **confirmed**.
- Placeholder names: `apps/fs-pro-server/src/utils/placeholder-names.ts:14-36` — **confirmed**.
- Culture model (a `culture` row, country mixes, club/region/city/district/stadium
  kinds, the ≥400/≥400 floors, the deny-list) does **not** exist — proposal.
  `Places` has no `CultureId`/culture column (schema.ts:46-83). **Confirmed "not built".**
- "Phase 1 Batch 4 never shipped" — the worldgen tree contains no club/place
  generators, consistent with that — **corroborated**.

### L13 — Villa (V) (REFUTED as today; USD is used)

- There is no Villa formatter. Client money is USD:
  - `apps/fs-pro-client/src/helpers/misc.ts:27-35` — `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
  - `apps/fs-pro-client/src/helpers/open-play.ts:109-111` — second USD formatter (`money`).
  - `apps/fs-pro-client/src/components/navigation/top-bar-ticker.vue:136-142` — a third, hand-rolled `$…M/k` formatter.
- Server-written money text uses literal `$` (see §7).
- Zero `€` or `£` anywhere in client or server:
  ```
  $ grep -rnE '€|£' apps/fs-pro-client/src apps/fs-pro-server/src apps/fs-pro-realtime
  (no output)
  ```
  — **confirmed zero**, but `$`/USD is used, so the L13 acceptance grep is **not**
  green today.
- "Stored numbers don't change (1 stored unit = V1)" holds trivially — `Clubs.Budget`
  is a `real` (schema.ts:194) and no split exists between display and storage.

---

## 2. Every place that assumes owner == manager

**Schema (the FK columns).**

- `apps/fs-pro-server/src/db/drizzle/schema.ts:181` `ManagerId: uuid('ManagerId').references(() => managers.id)` on `Clubs`.
- `apps/fs-pro-server/src/db/drizzle/schema.ts:581-582` `HomeManagerId` / `AwayManagerId` on `Fixtures`.
- Relations: `apps/fs-pro-server/src/db/drizzle/relations.ts:48, 110, 115`.
- Club interface: `apps/fs-pro-server/src/interfaces/Club.ts:14`; `apps/fs-pro-server/src/controllers/clubs/club.model.ts:21`; fixture model `apps/fs-pro-server/src/controllers/fixtures/fixture.model.ts:36-37`.

**The owner is inserted as the manager at founding** (the core assumption):
`club-founding.service.ts:442-443` (owner's name), `:469-480` (manager row),
`:487` (`ManagerId`), `:503` (manager.ClubId set to the new club). This is the only
code path that produces the user's "own" manager.

**Hire/fire treats the row as the club's single manager.**
`apps/fs-pro-server/src/controllers/clubs/club.controller.ts:24-76`
`hireManagerForClub` refuses if `club.ManagerId` is set (39–43); `fireManagerFromClub`
`:80-115` sets `ManagerId: null` (104) and releases the manager. There is no
distinction between "owner" and "the manager under contract".

**Simulation reads the manager as the club's tactical brain.**
`apps/fs-pro-server/src/jobs/buildSimulateMatchRequest.ts:51-54`;
`apps/fs-pro-server/src/jobs/simulationContract.ts:37-42` (ManagerId carried into
the request); `apps/fs-pro-server/src/controllers/game/game.controller.ts:281,288`.

**Client copy/screens that say "Manager" where phase 2 means "owner".**

- `apps/fs-pro-client/src/views/game/club-game.vue:645` — drawer title is `'Manager'`
  when `isMyClub`; `:598` comment "The Manager hub"; `:600` `HubKey`.
- `apps/fs-pro-client/src/views/game/club-game.vue:602-609` `HUB_TABS` (Matchday, Team sheet, Squad, Transfers, Club, Analysis).
- `apps/fs-pro-client/src/components/cozy/cozy-settings.vue:27` — "Manager hub".
- `apps/fs-pro-client/src/components/cozy/cozy-hud.vue:127` — dock button labelled "Manager".
- `apps/fs-pro-client/src/views/app-view.vue:16` (fallback name "Manager"), `:21` "Manager view"; `apps/fs-pro-client/src/components/navigation/top-bar-ticker.vue:37, 112`.
- `apps/fs-pro-client/src/views/user/settings.vue:27` Role subtitle "Manager".
- Manager picker/firer and zones: `apps/fs-pro-client/src/views/user/club/zones/club-zone.vue:1-38`,
  `apps/fs-pro-client/src/views/user/club/zones/owner-zone.vue:97-169` ("Manager &
  Technical Staff", "Hire Head Coach", "Terminate Contract").
- **Bug found:** `owner-zone.vue:111` reads `club.Manager.Rating` and
  `club.Manager.Tactic?.formationName`, but the manager model has neither `Rating`
  nor `Tactic` (`manager.model.ts:1-21`) — it always renders the defaults
  `65` and `'4-3-3'`. The correct fields are `PreferredFormation`/`PreferredStyle`.

**Manager hub copy in the owner-vs-manager sense** is therefore concentrated in
`club-game.vue` (drawer title, HUB_TABS), `cozy-settings.vue`, `cozy-hud.vue`,
`club-zone.vue`, `owner-zone.vue`, and `app-view.vue`.

---

## 3. `placeInPyramid` / mid-season join callers; what blocks PLAY today

- **`placeInPyramid` has exactly one caller:** `club-founding.service.ts:544`
  (imported at `:32`). Definition: `apps/fs-pro-server/src/services/competitions/world-competitions.service.ts:135-141`.
  It calls `joinPyramid` when the country's edition is running, else `drawPyramid`
  (140).
- **`joinPyramid` (mid-season join)** is defined at
  `apps/fs-pro-server/src/services/competitions/pyramid.service.ts:505-611`;
  its only in-app callers are `world-competitions.service.ts:138,140`. It is
  guarded by `pg_advisory_xact_lock` (`pyramid.service.ts:509`) and idempotent for
  a club already entered (513–520). The Go world-service picks the slot
  (`world-service.client.ts:130-131`).
- **Other pyramid writers:** `drawPyramid` from `world-competitions.service.ts:140,151`;
  `drawAllPyramids` at year end (`apps/fs-pro-server/src/services/world/year.service.ts:119`,
  `world-competitions.service.ts:144-158`); and the one-off migration script
  `apps/fs-pro-server/src/scripts/migration/start-world-pyramid.ts` (`backfillRegions`
  at :43, `drawAllPyramids` at :81, `ensureAmateurCup` at :83).
- **What blocks PLAY today: almost nothing.** `play.router.ts:61-73` gates on
  `canManageClub` only. `play.service.ts:258-270` adds: a between-match cooldown
  (`MATCH_COOLDOWN_SECONDS = scaled(300)`, `:36`) and a non-empty opponent pool
  (`opponentCandidates`, `:202-217`). There is **no manager gate and no min-squad
  gate**. A club with no lineup gets an auto lineups via `ensureDefaultLineup`
  (`play.service.ts:182`; `services/play/default-lineup.ts:18-26`), but that
  silently returns false when fewer than 11 signed players exist (`:26`), and PLAY
  then proceeds with an empty/partial squad.
- **The real funnel today** is that founding hands the club a manager and 16
  amateurs automatically (`club-founding.service.ts:469-505, 543`), so PLAY is
  never blocked. Phase 2's "no manager / no squad at founding" (L1) is exactly why
  the gate in L5 must be added.
- **A related gate that will matter:** signing free agents runs through
  `executePurchase` → `assertTransferWindowOpen()`
  (`apps/fs-pro-server/src/controllers/transfers/transfer.service.ts:36`;
  window logic `services/transfers/transfer-window.service.ts:25-41,83`). Outside
  an open window a new owner **cannot** buy free agents. The default calendar flag
  is `TransferWindowOpen = false` (schema.ts:282).

---

## 4. Free-agent stock (`ensureFreeAgentMarketStock`) and wage charging

- **Stock** (`foreign-intake.service.ts:141-167`): counts unsigned/non-retired
  players; if `GK < 2 || total < 8`, generates **16** players via
  `generateForeignLeagueIntake` (`:31-135`). Names come from
  `generateSystemCountryName(country.name)` (`:66`), values/wages from
  `generatePlayer` (`:79-88`).
- **No 5,000/1,000 seed** (see §1, L5). Dev DB snapshot:
  `free_agents = 144`, `free_agent GKs = 6` (query in §8 note) — far from 5,000.
- **Wage charging** (`apps/fs-pro-server/src/controllers/transfers/transfer.service.ts:175-206`):
  one SQL statement per game Year, once per club, guarded by a
  `TransferLedger(Type='wage', BuyerClubId, Year)` existence check and a
  `wage:<year>` advisory lock. It charges `sum(Players.Wage) FILTER (WHERE isSigned)`
  for `Clubs` with `ReleasedAt IS NULL` (185–199). Free agents have no `ClubId`,
  so they cost nothing until signed. Called only at year end
  (`apps/fs-pro-server/src/services/world/year.service.ts:111`).
- **Wage model:** `Wage = round(Value * WAGE_RATIO)`, `WAGE_RATIO = 0.15`
  (`apps/fs-pro-server/src/utils/players.ts:42-50`). A flat ratio of Value, not a
  considered balance — documented as placeholder.
- **Signing money path:** `executePurchase` (`transfer.service.ts:26-74`) checks the
  window, ownership, retirement, that the player is a free agent, `offerAmount >=
  player.Value` (62–66) and budget (68–71), then `settleTransfer` (`:83-146`) which
  does the budget debit as a **plain** `SET Budget = Budget - amount` inside a
  transaction (101–107) — **no `Budget >= cost` guard**. So L5's "conditional
  update … with a race test" describes the target, not today's code, and the
  read-then-write affordability check at :68-71 is raceable.
- **Free agents cost full Value** (`transfer.service.ts:61-66`); only the AI market
  buys free agents at `Value * 0.6` (`transfer-market.service.ts:607,669`).
- **Dev-DB price reality (why this matters for L7/P7):**
  ```
  select ... Value, Wage from Players where isSigned=false and isRetired=false;
   n=144  min_v=0  med_v=1,280,000  max_v=68,400,000  min_w=0  med_w=129,912
   by position medians: GK 165,010 · DEF 1,518,000 · MID 1,291,550 · ATT 1,051,450
  ```
  A **single median free agent costs ~V1.28M**, so a V1M–V5M start cannot buy a
  normal starting XI at full Value; only free-agent GKs are cheap. The price/Value
  model and the V1M–V5M start are currently incompatible without a new pricing
  curve (L5) or a different signing cost.

---

## 5. Facility costs and times against a V1M–V5M start

Source: `apps/fs-pro-server/src/services/facilities/asset-config.ts`.
`upgradeCost(type, n) = round(baseCost * costGrowth^(n-1))` (160–163);
`upgradeMinutes(type, n) = scaled(baseMinutes * n)` (167–170), `GAME_TIME_SCALE`
default 1 (`services/play/game-time.ts:7-10`).

| Asset | baseCost | growth | baseMin | Tier 1 cost / time | Tier 2 cost / time | Tier 3 cost / time |
|---|---|---|---|---|---|---|
| stadium_grounds | 250,000 | 2.4 | 20 | 250k / 20m | 600k / 40m | 1.44M / 60m |
| stands | 300,000 | 2.5 | 30 | 300k / 30m | 750k / 60m | 1.875M / 90m |
| training_ground | 200,000 | 2.3 | 20 | 200k / 20m | 460k / 40m | 1.058M / 60m |
| youth_academy | 350,000 | 2.4 | 40 | 350k / 40m | 840k / 80m | 2.016M / 120m |
| scouting | 220,000 | 2.3 | 25 | 220k / 25m | 506k / 50m | 1.164M / 75m |
| medical_centre | 260,000 | 2.4 | 25 | 260k / 25m | 624k / 50m | 1.498M / 75m |
| staff_house | 300,000 | 2.5 | 35 | 300k / 35m | 750k / 70m | 1.875M / 105m |

- `MAX_ASSET_LEVEL = 5` (`:23`), `MAX_CONCURRENT_UPGRADES = 1` (`:26`).
- Build prerequisites (`requires`): stands→stadium_grounds(−1), youth_academy→training_ground(−1),
  medical_centre→training_ground(−1), staff_house→training_ground(−1) (`:84,105,126,149`).
  At Tier 1 the requirement resolves to level ≥ 0, so it never blocks the first build.
- With **V1M**, one Tier-1 line costs 200k–350k plus the squad and manager; with
  **V5M** a full Tier-1 set (~1.88M) is affordable but leaves little for players.
- **Naming fact (R5'):** the code still says `level` everywhere: `AssetDefinition`
  uses `baseCost/baseMinutes` and the `ClubAssets.Level` column (schema.ts:849,
  "a missing row means Level 0" at 835); `effectLabel` strings say things like
  `Coaching level ${l}` (`asset-config.ts:150`). The UI is inconsistent: the cozy
  campus already says **Tier** (`club-game.vue:81,83,535,1172`;
  `components/cozy/cozy-panel.vue:6,11,23,27`) while the older panels still say
  **Level** (`components/campus/facility-detail-sheet.vue:13,238,250,258,294,305`;
  `views/user/club/zones/facilities-panel.vue:24,32,56`). Phase 2 must finish the
  Tier rename.

---

## 6. Onboarding UI and the inbox welcome card (incl. `fspro_steps_<id>`)

**Founding wizard** — `apps/fs-pro-client/src/views/game/found-club.vue`:
three steps `home | club | review` (`:214-217`), atlas map (`:3-12`), place/name
entry, crest designer, and a success panel (`:161-171`) whose button links to
`/game/<id>?welcome=1`. It never shows a budget. The copy at `:149` ("You start
from nothing… Your league fixtures start right away.") reflects today's
auto-squad/auto-pyramid behaviour and will change.

**Campus first-steps** — `club-game.vue:1038-1081`:
`firstSteps` (1062-1079) returns five device-local steps for clubs at
`level <= 2` (`:1063`): `collect`, `play`, `prep`, `build`, `league`; each `done`
flag mixes heuristics and `stepFlags`; persisted only in
`localStorage['fspro_steps_<clubId>']` (`:1045,1056`). `coach` (`:1081`) is the
pulsing-pointer target.

**Inbox welcome card** — the welcome is written server-side at founding as a
`ClubMessages` row (`club-founding.service.ts:564-577`):
```
570  Title: `Welcome to ${placed.district.Name}`,
571  Body: `${name} is official. You have a dirt pitch, ${SQUAD_SHAPE.length} hopeful amateurs and ` +
573        `${STARTING_BUDGET.toLocaleString('en-US')} in the bank.` + ... ' Win matches to earn money and XP...'
```
It is read via `client.play.getInbox` (`use-club-game.ts:97-105`, model `Inbox`)
and rendered only inside the "While you were away" overlay: `club-game.vue:1144-1147`
maps unread messages to events; `:1160-1162` sets the title to
`Welcome to <club>` on the first device visit. `showAwaySummary` marks the inbox
read on close (`:1190`).
Gap: `?welcome=1` is written by `found-club.vue:171` but `club-game.vue` never
reads `route.query.welcome` (grep found it only in `found-club.vue`), so it is a
dead parameter. `challenge-inbox.vue` (the side-sheet) is a different feature
(open-play challenges), not this welcome card.

---

## 7. Every name source and every money display

### Name sources

1. **worldgen (Go)** — `services/worldgen`:
   - Banks: only `services/worldgen/names/data/name_bank/{bellean,kev}.json`
     (embedded via `generator.go:20`). Each is a keyword→words map (`title`,
     `prefix`, `preposition`, `firstname`, `lastname`, `modifier`, `suffix`).
   - Arrangements: `services/worldgen/names/data/misc/name_arrangements.json`
     (`bellean`, `kev` only).
   - `GenerateName` (`generator.go:85-118`) composes **person** first/last only;
     no club/region/city/district/stadium kinds. Served at
     `POST /api/services/worldgen/names` (`controllers/services/services.router.ts:53-75`).
2. **Node syllable tables** — `apps/fs-pro-server/src/services/transfers/system-country-names.service.ts:12-79`,
   11 culture keys (see §1/L12); used by `generateForeignLeagueIntake` (`foreign-intake.service.ts:66`).
   Used only by foreign intake today.
3. **Placeholder names** — `apps/fs-pro-server/src/utils/placeholder-names.ts:14-29`
   (30 first, 30 last, English/cozy). Used by founding squad
   (`club-founding.service.ts:201`) and youth intake
   (`controllers/players/player-lifecycle.service.ts:217`). Names are not keyed by
   nationality — the same pool is drawn for every country (hence "Callum Ellery"
   in Bellean, see §8).
4. **Founding place names** — founder-named `country`/`region`/`city`
   (`club-founding.service.ts:316-383`) and an **auto-named district** via
   `regionName(city.Name, n)` = `<City> <Compass>` (`placement.service.ts:377-383`,
   called at `club-founding.service.ts:393`). Admin-created cities also create a
   `<City> Central` district (`services/world/atlas.service.ts:391-401`); the
   placement preview shows the same default (`placement.service.ts:140`).
5. **Manager name at founding** = the owner's own account name
   (`club-founding.service.ts:443, 473-474`) — the owner-as-manager assumption.
6. **Faces** are generated deterministically by worldgen from a stable id
   (`controllers/players/player-face.router.ts`, `controllers/managers/manager-face.router.ts`).

### Money displays — symbol and format

Client current money formatting (all USD `$`, `maximumFractionDigits: 0`):
`helpers/misc.ts:27-35` (`currency`, USD) and `helpers/open-play.ts:109-111`
(`money`, USD). A third `$…M/$…k` formatter is
`components/navigation/top-bar-ticker.vue:136-142`. `components/cozy/cozy-campus.vue:76`
prints a bare short number (no symbol).

`currency(` usages (by file, count): `cozy-hud.vue`(2), `cozy-panel.vue`(1),
`club-top-hud.vue`(1), `board-budget-dialog.vue`(8), `buy-player-dialog.vue`(4),
`list-player-dialog.vue`(2), `players-table.vue`(1), `transfer-market-table.vue`(2),
`transfer-offers-panel.vue`(4), `transfer-scout-dialog.vue`(3),
`club-game.vue`(2), `facility-detail-sheet.vue`(1), `facilities-panel.vue`(1),
`owner-zone.vue`(4 via `formatCurrency`), `play-panel.vue`(3), `squad-zone.vue`(1),
`team-sheet-zone.vue`(2), `transfer-zone.vue`(5), `view-player.vue`(5).
`money(` usages: `top-bar-ticker.vue`(2), `competition-card.vue`(1),
`world-map.vue`(1), `edition-finished.vue`(1), `competitions.vue`(2),
`edition.vue`(2), `competition-view.vue`(1).

Client literal `$` money strings (not via a helper):
- `components/media/general-media-card.vue:221,499,502,574` (`$${…toLocaleString()}`).
- `components/players/board-budget-dialog.vue:314-317` (`+$500K`, `+$1.0M`, `+$2.5M`, `+$5.0M`).
- `helpers/open-play.ts:92` (`$${e.entryFee.toLocaleString()} to enter`).

Server-written money text (all literal `$`):
- `services/media/story-copy.service.ts:10` — `const money = (n) => \`$${Math.round(n).toLocaleString()}\`` (used throughout story copy).
- `services/media/media-hub.service.ts:842` (`Fee: $…`), `:885` (`Valuation: $…`).
- `services/ai/board-budget.service.ts:35-36,189` (`$${grantedAmount…}`, `$${requestedAmount…}`).
- `services/facilities/medical.service.ts:135,231` (`($${cost…} required)`).
- `services/world/club-founding.service.ts:573` — `STARTING_BUDGET.toLocaleString('en-US')` (a bare number, no `$`).
- `services/world/world-feed.service.ts:175` — `Math.round(t.Amount).toLocaleString('en-US')` (bare number).
- Dev scripts only: `scripts/testBoardBudgetRequest.ts:19-27`, `scripts/testJevGatekeeper.ts:40,51,62` (`$` in console).
- Non-money `toLocaleString` (capacity/fans/dates) at `asset-config.ts:85`,
  `standing-news.service.ts:53,56`, `club-standing.service.ts:104,120`,
  `seedScaleWorld.ts:51`.

**Zero `€`/`£`** (command output in §1/L13).

---

## 8. Current Places rows per starting country, and sample player names

Read-only queries against `fspro` (see the schema caveat at the top).

**Countries (11):** Ashter (ASH), Bellean (BELL), Ekhastan (EKH), Hunteerland (HUN),
Kev (KEV), Kiyoto (KIY), Legardio (LEG), Pregge (PRG), Proland (PRO), Simeone (SIM),
UPP (UPP). Note the DB uses short forms (`Simeone` for STARTER's "Simeon", `Hunteerland`
for "Hunterland", `UPP` for the Inga countries); STARTER's "Republic of Galli" has no
row, and `Pregge`/`Proland` are additional countries not named in STARTER (both have their own Node syllable tables).

**Places per country (regions / towns):** only Bellean and Kev have child places.

| Country | Regions | Towns |
|---|---|---|
| Bellean | Bellean Central, Bellean North | Aceepot, Dha Marm, Ivania, Ivania Central, KhalenJoosh, Kukinn, Northgate, Philamentia, Southport, Tileland, Tobakaeem |
| Kev | Kev Central, Kev North | Ceviva, Damwinth, Feedhein, Jacwinth, Manitobva, Midu, Poovent, Portgregge, Potgregge, Pregge, Sdev, Stonkev, Storr |
| the other 9 | none | none |

These sheet-derived names (STARTER §Kev states, Palaba provinces, Bellean map names)
are exactly the seed material L12 wants in the Karsh/Kev/Inga banks.

**Sample existing player names per country** (8 per country, `ORDER BY` arbitrary):

- **Ashter:** Daniir Manso · Danion Kaphari · Falmata Muhudia · Jeran Mansian · Safon Sultry · Safood Muhudy · Tesa Opoly · Zehon Kharopo
- **Bellean:** Aspers Goatee · Callum Ellery · Cyrus Underhill · Kellan Ashgrove · Takeshi Monrovia · Wesley Draven · Wesley Fenwick · Wesley Thackery
- **Ekhastan:** Alkhaad Sultat · Alkhakha Akhta · Ehloonsta Badrari · Ehlouq Jaheen · El Amoonsta Bindoosh · Maloonsta Jaheh · Melanin Agunboro · Rashar Malikat
- **Hunteerland:** Dippo Futt · Huik Boja · Huiund Bojland · Huke Donjun · Iam Heer · Ivan Taar · Kalts Frostgard · Svenen Vinqvist
- **Kev:** Antulev Hanvivablud · Brendan Ivester · Ddyke Slavak · Farg Nublud · Fedgov Estavivaegge · Fene Carrgard · Paldrov Moppe · Vromdiche Kev
- **Kiyoto:** Hiwei Opanimei · Jakhee Joie · Kentor Satogawa · Prei Chanko · Rioro Joimoto · Sinpei Vhier · Yowei Kiki · Yung Boi
- **Legardio:** Fine Sisei · Jollee Bellaro · Jollo Bellano · Markino Bello · Plastiquee Jamezo · Plastiquetto Didon · Raktanus Bellano · Tomketto Siso
- **Pregge:** Duno Chevegge · Grebpp Stuechi · Gregge Baggge · Ilu Zamezi · Pootopp Thippp · Pootpp Plummpp · Stuppp Mhane · Tihess Annde
- **Proland:** Danay Nole · Kevinn Nolan · Pak Or · Palic Borkovic · Phoward Mann · Re Bukke · Stanik Fullmeinenko · Viktan Nolic
- **Simeone:** Eldoosh Ashtop · Genius El Kanemi · Kalvin Gonzalez · Martio Castetti · Pess Patten · Prosper Target · Pupu Tuallet · Sy Barn
- **UPP:** Bozoki Bo · Cho er Brickhands · Desktoop Changehands · Emet Highlander · Kosho Undatop · Petro Da-Cash · Winn Fells · Yama Rita

Culture inputs worth noting from the sample: syllable-table output dominates every
country; several names are real-world/English (Bellean's `Wesley *`, `Callum
Ellery`; Kev's `Brendan Ivester`; Simeone's `Kalvin Gonzalez`) — a mix of the
placeholder pool and hand-entered rows; a few are odd/NSFW-adjacent
(`Duno Chevegge`, `Sultry`, `Sy Barn`, `Pupu Tuallet`, `Yama Rita`). This is the
raw material a culture model must clean up or replace, and the worldgen deny-list
(L12) must be strong enough to exclude real players/clubs.

Dev-DB counts used above: free agents 144 (unsigned, non-retired); GKs among them 6;
`Managers` 52 total (45 employed, 7 not; 3 of the 7 have no club). **No manager**
has `PreferredFormation` or `PreferredStyle` set (0/52), so `resolveManagerTactic`
always returns the default and the manager currently has **no tactical effect**.

---

## 9. Surprises / risks

1. **The dev DB `fspro` is behind the code** (no `city`/`district`, `Clubs.TownId`,
   no `PlaceStats`/`TileRevisions`/`PlaceInvites`; migration 0038 unapplied). The
   current founding path would fail against it. Any "seed on the dev DB" release
   step must first reconcile migrations, and the culture read above is from the old
   place tree.
2. **No world seed exists.** 5,000 players / 1,000 managers (P7) is entirely new
   work; today's top-up is 16 players when the pool drops below 8.
3. **The existing price curve breaks the V1M–V5M start.** Free agents cost full
   `Value`, median ~V1.28M. A new owner cannot assemble a legal squad at V1M–V3M
   without a new pricing/lending/recovery model (L5/L7). This is the biggest
   difficulty-design risk.
4. **Free-agent signing is window-gated and not race-safe.** `executePurchase`
   requires an open transfer window and does a read-check-then-write budget debit
   (no `Budget >= amount` SQL guard), so it does **not** yet match the L5
   concurrency requirement. Transfer-window default is closed.
5. **PLAY is not gated by a manager or a legal squad.** Today founding hides this
   by creating both. After L1 removes them, a missing gate leaves PLAY playable
   with an empty squad; `ensureDefaultLineup` silently no-ops under 11 players.
6. **Managers have no effect today.** All 52 rows have null `PreferredFormation`/
   `PreferredStyle`; `resolveManagerTactic` always falls back. L4's "better manager
   carries out the brief better" needs the whole attribute + mapping layer.
7. **Money is USD everywhere, in three different formats** (`currency`, `money`,
   and a hand-rolled `$…M/k`). L13's single Villa formatter will touch ~50 call
   sites plus server strings (`story-copy`, `media-hub`, `board-budget`, `medical`,
   `world-feed`, founding welcome). `€`/`£` grep is already zero, so the acceptance
   grep must be tightened to `$`/USD to be meaningful.
8. **The founding welcome message and the offline summary are the only "onboarding
   welcome" today**, and `?welcome=1` from the founding button is never read.
9. **Name generation is split across four systems** (worldgen 2 cultures, Node 11
   syllable tables, a 60-name placeholder pool, founder-typed place names),
   producing inconsistent and occasionally real-world/odd names. Worldgen generates
   **person names only** — club/region/city/district/stadium kinds and the culture
   row do not exist yet.
10. **Client manager copy** still calls the player a "Manager" throughout
    (`club-game.vue:645`, `cozy-hud.vue:127`, `cozy-settings.vue:27`,
    `app-view.vue:16,21`, `owner-zone.vue:100`), and `owner-zone.vue:111` reads
    `Manager.Rating`/`Manager.Tactic`, which the schema does not have.
11. **Facility naming is inconsistent** (code/DB say `Level`, cozy UI says `Tier`,
    older panels still say `Level`) — the R5' Tier sweep is unfinished.
12. **Path-citation mismatch:** the docs cite server paths without the
    `apps/fs-pro-server/src/` prefix; this is fine as a convention but every
    `file:line` in FOR-AGENTS §2 resolved only after prepending it (all matched).
