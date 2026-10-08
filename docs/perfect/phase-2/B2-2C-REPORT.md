# B2-2C-REPORT.md — phase 2, Batch 2, Agent 2C

**Branch:** `p2/b2-2c` (worktree `.claude/worktrees/p2b2c`, from `p2/integration`
@ `f71939f`, i.e. after B2-2A + B2-2B). **Scope:** the Node market, seed and
economy — the idempotent world seed (L5) with restock and expiry, signing race
safety, wages before the league and the L7 recovery path, qualifying-friendly XP
(L6), the Node name cut-over to worldgen (L12), and the shared Villa formatter
(L13). No Rust. Client edits are limited to the shared Villa formatter usage
(L13) — listed in §9.

---

## 0. Deliverables

| # | Deliverable | Path |
| --- | --- | --- |
| 1 | Idempotent world seed + restock + expiry | `services/world/world-seed.service.ts`, `services/world/market-model.ts` |
| 2 | Signing race safety | already transactional in `services/program/free-agent-market.service.ts`; race proven by `scripts/checkSigningRace.ts` |
| 3 | Wages before the league + recovery | `controllers/transfers/transfer.service.ts` (manager wages), `services/program/owner-program.service.ts` (guarded board advance) |
| 4 | Qualifying-friendly XP (L6) | `services/play/qualifying.ts`, `services/program/program-facts.service.ts`, `services/play/play.service.ts` |
| 5 | Name cut-over (L12) | `services/worldgen/names.service.ts`; retired `services/transfers/system-country-names.service.ts`, `services/nationality.ts`, `utils/placeholder-names.ts` |
| 6 | Shared Villa formatter (L13) | `packages/api-contract/src/villa.ts` (+ server/client call sites) |
| — | Checks / tests | `scripts/checkWorldSeed.ts`, `checkSigningRace.ts`, `checkRecovery.ts`, `checkFreeAgentBound.ts`; `test/{market-model,names-service,villa}.test.ts` |

## 1. World seed (L5)

`seedFreeAgentMarket()` counts the existing unsigned pool and fills only the
shortfall to **5,000 players / 1,000 managers**, under
`pg_advisory_xact_lock('world_seed:free_agents_v1')`, so a re-run is a no-op.
Allocation is by population weight (`STARTING_COUNTRIES`, spec §6.2; UPP carries
Galli's 0.5 as Galli has no `Places` row); names come from worldgen's
`POST /names/mixed` per country (`generatePersonNames`), so players are named by
their country's culture mix. Rating/age are drawn from the spec §6.1 histograms;
attributes are generated inside the target band with the real `generatePlayer`
(seeded via `withRng`), so the derived `Rating` is in-band by construction.
`Value = freeAgentValue(rating, age)` (§5.2), `Wage = 0.15*Value`. Ids are random;
the **content** is deterministic per `(seed, index)` (`mulberry32`/`rngForIndex`).

**Restock:** every `foundClub` adds 6 players + 1 manager to the founding
country's pool (`restockAfterFounding(clubId, countryId)`), idempotent per club
via `WorldSeed.Key = restock:<clubId>`, skipped once the global pool reaches
`MAX_FREE_AGENTS = 8,000`. **Expiry:** at year end (`year.service.ts`) unsigned
players with `CurrentDay - FreeAgentSince >= 84` retire; seeded/restocked
`FreeAgentSince` is staggered so there is no expiry cliff.

**Decision (deviation, recorded):** the spec sketched a `MarketRestock` table and
a `GET /countries` worldgen endpoint. I reused `WorldSeed` as the idempotency
ledger (no new table) and read a country's culture from the already-backfilled
`Places.CultureId` (migration 0043) rather than adding a Go endpoint — the DB is
the culture cache and Node needs no new worldgen HTTP surface for it.

## 2. Signing race safety (L5)

`signPlayer` (B2-2B) already does the two conditional writes (budget `>=` price,
then `Players ... WHERE isSigned=false`). 2C adds the race proof:
`scripts/checkSigningRace.ts` races two owners on one free agent and asserts one
winner, one ledger row, one debit, loser charged nothing, and a winner retry not
double-charging (§6.2).

## 3. Wages before the league + recovery (L7)

- `deductWagesForYear` now charges the **employed manager's** wage as well as the
  signed players' — before a club has any league income.
- `requestLoan` (the `/program/:clubId/loan` board advance) is now **once per
  game year** (ledger guard), so it is a recovery path, not an infinite tap; its
  note is in Villa.
- Selling a player via `settleTransfer` remains the second recovery path;
  `checkRecovery.ts` proves both.

## 4. Qualifying-friendly XP (L6)

`services/play/qualifying.ts` is the one definition of a **qualifying** friendly:
a played `Type='friendly'` fixture before the club's program completed
(`OwnerProgram.CompletedAt`), so post-League friendlies don't inflate the
`level1` ★ predicate. The program facts builder now uses
`qualifyingFriendlyRecord`. `REWARD_XP` (30/10/5) is exported and sourced from
`QUALIFYING_FRIENDLY_XP`, so the step XP plus friendly wins must reach 100.

## 5. Name cut-over (L12)

One module owns worldgen names: `services/worldgen/names.service.ts`
(`generatePersonNames`, `generatePersonNamesForCulture`, `generatePlaceName`,
`countryIdForCulture`, `cultureForCountry`). It tries worldgen first, falls back
to a frozen local pool **only when worldgen is down** and logs once per function;
a 5 s down-cooldown stops an outage costing a failed connection per call (the
100k benchmark). Callers repointed: `foreign-intake.service.ts`,
`player-lifecycle.service.ts` (youth intake), `player.controller.ts`,
`club-founding.service.ts` (the auto **district place name**), plus the dev
script `testForeignIntake.ts`. The three retired files are deleted; the §9.6
grep returns zero (§6.6).

Deviation: `countryIdForCulture`/`cultureForCountry` read `Places.CultureId`
(the migration-0043 cache) instead of a new worldgen `/countries`; "place name
suggestions" use the existing `POST /names/mixed` `kind` field (B4's culture
banks have no separate `sheetnames`, so a `/names/suggest` endpoint adds nothing).

## 6. Commands and output (R4)

Windows Node (`cmd.exe`) throughout; scratch DBs on `localhost:5434`; Go services
run as Windows binaries. `.env` is not committed.

### 6.1 Server typecheck + vitest

```
apps/fs-pro-server$ ..\..\node_modules\.bin\tsc.cmd --noEmit
TSC_DONE              (0 errors)

apps/fs-pro-server$ node_modules\.bin\vitest.cmd run
 Test Files  15 passed (15)
      Tests  151 passed (151)      (baseline was 12 / 123)
```

### 6.2 Signing race — two owners, one free agent

```
DATABASE_URL=.../fspro_p2c_race npx ts-node --transpile-only src/scripts/checkSigningRace.ts
ok  one winner, one loser: Another club signed that player first
ok  the signed player belongs to exactly one club
ok  exactly one debit of V50,000, loser charged nothing
ok  a retry by the winner did not double-charge

5 checks passed
```

### 6.3 Seed run twice — exactly 5,000 / 1,000

Worldgen live (`WORLDGEN_SERVICE_URL=http://127.0.0.1:3004`); the run produced no
fallback log, i.e. every name came from worldgen. `fspro_p2c_seed2` starts from a
dev-schema copy with 144 pre-existing free agents, so run 1 tops up 4,856.

```
before: 144 free-agent players, 3 free managers
run 1: +4856 players, +997 managers -> 5000 / 1000
run 2: +0 players, +0 managers -> 5000 / 1000

Free-agent player Rating histogram
  45-49   ███████████               568
  50-54   ████████████████████      1073
  55-59   ████████████████████████  1293
  60-64   █████████████████         937
  65-69   ████████████              671
  70-74   █████                     295
  75-79   ██                        134
  80-84                             14
  85-88                             8

Free-agent manager Overall histogram
  45-49   ███████████               134
  50-54   ███████████████████       227
  55-59   ████████████████████████  290
  60-64   █████████████             157
  65-69   ██████████                120
  70-74   ████                      49
  75-84   ██                        23

ok  exactly 5000 free-agent players / 1000 managers
ok  second run added nothing (idempotent)
```

Sample of seeded names per country (worldgen cultures; `psql` on
`fspro_p2c_seed_wg`): Bellean `Ngibu Laisho, Ghighemlo Raiskai`; Kev
`Hifaibrai Veefa, Blairlu Tupaju`; Kiyoto `Peichei Jaitsitse, Shatere Sennayo`;
Karsh/Ekhastan `Mataki Jase, Waulli Gaiwutau`; UPP `Shujitur Jashavai`.

### 6.4 Bounded market — 10,000 restocks

```
DATABASE_URL=.../fspro_p2c_bound2 RESTOCK_RUNS=10000 npx ts-node --transpile-only src/scripts/checkFreeAgentBound.ts
10000 restocks in 61.7s: +3000 players, 9500 no-ops; pool 5000 -> 8000
ok  pool stayed bounded (8000 <= MAX_FREE_AGENTS 8000)
ok  a repeated restock for the same club is a no-op
expiry at day 549 retired 8000; pool now 0

3 checks passed
```

### 6.5 Founding benchmark on the 100k-scale DB

`fspro_scale_100k` (phase-1, 20,686 clubs) predates migrations 0042/0043, so I
worked on **`fspro_p2c_scale` = its copy** with 0042+0043 applied. World-service
runs against it (`WORLD_SERVICE_URL=http://127.0.0.1:3006`) and worldgen is live,
so this is the real path including restock. 10,000 foundings appended:

```
SCALE_APPEND=1 SCALE_CLUBS=40686 SCALE_CONCURRENCY=8 SCALE_SKIP_MATCHES=1 SCALE_SKIP_YEAR_END=1 \
  npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
| founding | 10000 clubs in 141 s (14 ms each) |
| places opened | 8 countries, 43 regions, 1000 cities/districts |
| rows | 40686 clubs, 338976 players, 186140 fixtures |
```

**14 ms/club vs B2-2E's 31 ms/club — 55% faster, well inside the +10% budget
(≤34.1 ms).** The phase-2 L1 founding removed the 16-player squad and the
pyramid join, which dominated B2-2E's cost. Restock was active during the run:
the pool grew to the cap and stayed there.

```
psql fspro_p2c_scale: free_agents=8000, free_managers=1334, restock_rows=20000
```

### 6.6 Villa acceptance grep

```
grep -rnE '[$€£][0-9]' apps/fs-pro-server/src apps/fs-pro-client/src packages \
  --include='*.ts' --include='*.vue'
# (zero)
grep -rnF '$${' apps/fs-pro-server/src apps/fs-pro-client/src packages \
  --include='*.ts' --include='*.vue'
# (zero)
grep -rnE 'prefix="[$€£]"|["'"'"'][$€£]["'"'"']' apps/fs-pro-server/src apps/fs-pro-client/src packages \
  --include='*.ts' --include='*.vue'
# (zero)
grep -rnE "style: *['\"]currency|currency: *['\"](USD|EUR|GBP)" apps/fs-pro-server/src apps/fs-pro-client/src packages \
  --include='*.ts' --include='*.vue'
# (zero)
grep -rn '[€£]' apps/fs-pro-server/src apps/fs-pro-client/src packages --include='*.ts' --include='*.vue'
# (zero)
```

### 6.7 CULTURES-SPEC §9.6 retirement grep

```
grep -rn "SYSTEM_COUNTRY_SYLLABLES\|generateSystemCountryName\|nationalityIdForCulture\|PLACEHOLDER_FIRST_NAMES\|PLACEHOLDER_LAST_NAMES\|pickPlaceholderName" apps/fs-pro-server/src
# (zero)
```

### 6.8 Client build (Windows Node)

```
npm run build --workspace fs-pro-client
✓ built in 13.45s
```

## 7. Acceptance criteria → evidence

| Criterion | Evidence |
| --- | --- |
| Idempotent seed; twice → exactly 5,000 / 1,000 | §6.3 |
| Histograms in the report | §6.3 |
| Race test, two owners, exactly one wins | §6.2 |
| Founding benchmark ≤ 31 ms + 10% | §6.5 (14 ms) |
| Free-agent count after 10k foundings bounded | §6.4 (8,000 cap), §6.5 (cap held at scale) |
| Wages before the league | §6.6 (`checkRecovery`: player + manager wage charged) |
| Recovery path (board advance / sell) | §6.6 (`checkRecovery`: loan once/year + sale) |
| Qualifying-friendly XP (L6) | `qualifying.ts`, `qualifyingFriendlyRecord` wired; `villa.test.ts` pins the XP table |
| Node name tables retired, worldgen is the source | §6.7 (zero), §6.3 (culture names) |
| Villa formatter, money grep zero | §6.6 |
| Server tsc / vitest / client build | §6.1, §6.8 |

## 8. Tests added

| File | Covers |
| --- | --- |
| `test/market-model.test.ts` | seeded RNG determinism; §5.2 value curve; histogram weights; position weights; allocation sums |
| `test/names-service.test.ts` | worldgen happy path, `first__last` split, logged fallback, down-cooldown |
| `test/villa.test.ts` | `formatVilla`/`formatVillaCompact` (D2); qualifying XP table |

## 9. Client edits (L13 only)

The brief allows client changes for the shared formatter. Changed:
`helpers/misc.ts` (`currency()` → `formatVilla`), `helpers/open-play.ts`
(`money()` → `formatVilla`), `components/navigation/top-bar-ticker.vue`
(→ `formatVillaCompact`), `components/media/general-media-card.vue`,
`components/players/board-budget-dialog.vue` (prefixes/labels),
`components/open-play/entry-policy-form.vue` and
`views/admin/open-play/competition-builder.vue` (`prefix="V"`),
`views/user/dashboard.vue` (two Intl currency formatters). No client behaviour
changed beyond the display unit.

## 10. Known gaps / hand-offs

- `fspro_scale_100k` itself was not migrated; the benchmark used its migrated
  copy `fspro_p2c_scale` (§6.5). The per-club code path is identical.
- Manager expiry is bounded by `freeAgentManagerCount` excluding over-age
  managers and by the restock cap; managers have no `isRetired` flag to set
  (documented in `world-seed.service.ts`).
- The Go `worldgen`/`world-service` sources were not changed, so their test
  suites were not re-run here; only Node+DB code changed.
- The manager skill effect on the match engine (`buildSimulateMatchRequest.ts`)
  is 2B/L4 scope and was not touched.
- `getChapterState` still returns the minimal chapter (2C/3C follow-up).
