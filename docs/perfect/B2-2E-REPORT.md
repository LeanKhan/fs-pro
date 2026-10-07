# B2-2E-REPORT — make founding fast enough for a 100k-club D5 run

Agent: **2E** (`perfect/b2-2e`). Worktree
`/mnt/c/done/fs-pro/.claude/worktrees/b2e`, branch `perfect/b2-2e`,
base `perfect/integration` @ `2f1c04c`.

Goal: cut the founding rate from ~132 ms/club (B2-2D's 100k attempt, projected
4–6 h) toward **<27 ms/club**, so a 100,000-club run fits a 45-minute budget.

Result: **the 100k world now founds to completion in 3,066 s (31 ms/club,
51.1 min) with `SCALE_CONCURRENCY=8`, 0 warnings and a consistent world.** The
single-client per-founding path went **58 → 38 ms** at 1k and **46 ms** at 10k.
The 45-minute target is missed by ~13%; the remaining floor is two costs in
code this agent does not own (§7), both fixable with migration 0039.

Every claim below cites a command and its output (R1).

---

## 1. What changed (files)

| File | Change |
| --- | --- |
| `apps/fs-pro-server/src/utils/players.ts` | `generatePlayer`'s per-player `console.log` is gated behind `DEBUG_PLAYER_PAYLOAD=true`. |
| `apps/fs-pro-server/src/scripts/scale-codes.ts` (new) | The scale harness's short-code generator, side-effect-free so it is unit-testable. `scaleClubCode(n)` = letter + three base-36 chars (26·36³ = 1,213,056 unique), replacing the 17,576-wrapping letters-only scheme B2-2D fixed in place. |
| `apps/fs-pro-server/src/scripts/seedScaleWorld.ts` | Imports `scaleClubCode`; adds `SCALE_CONCURRENCY` (bounded parallel founding, default 1) and `SCALE_SKIP_YEAR_END=1`. |
| `apps/fs-pro-server/src/services/world/club-founding.service.ts` | See §3. |
| `apps/fs-pro-server/test/scale-codes.test.ts` (new) | Uniqueness/format test past 17,576. |
| `docs/SCALE.md` | New B2E section. |
| `docs/perfect/B2-2E-REPORT.md` | This report. |

Note: `apps/fs-pro-server/src/scripts/scale-codes.ts` and
`test/scale-codes.test.ts` are new files created by this agent; no other agent
owns them.

---

## 2. Profile: what actually cost the time

Phase timers on `foundClub` (`SCALE_PROFILE=1`), ms/club, fresh `fspro_b2e`:

| Phase | @1,000 | @10,000 | Cause (file:line) |
| --- | --- | --- | --- |
| `a2:owned` (club-cap count) | 1.1 | **3.3** | `SELECT count(*) FROM Clubs WHERE UserId=? …` — **no index on `Clubs.UserId`** → seq scan, O(N). `club-founding.service.ts` (owned). |
| `clubNameTaken` (identity) | 1.4 /1k clubs | — | `lower(Name)=lower(?) OR upper(ClubCode)=upper(?)` → seq scan, O(N). `atlas.service.ts:253` (not owned). |
| `calculateAndUpdateClubRating` | ~2 | — | `WHERE ClubId=? GROUP BY Position` on Players — **no index on `Players.ClubId`** → O(N). |
| `ensureDefaultLineup` | ~4 | — | two more Players reads by `ClubId` → O(N). |
| `placeInPyramid`/`joinPyramid` | ~17 | **30.2** | ~10 queries + Go round-trip + ~9 fixture inserts; `joinPyramid`'s `members` query has no `(SeasonId, Group)` index. `pyramid.service.ts:588` (not owned). |
| `postNews` | ~4 | 6.3 | 4 queries + insert. `news-scope.service.ts` (not owned). |

The B2-2D report blamed the per-player `console.log`; it is real but small
(~2 ms and ~11 KB/club). The 132 ms/club at 20k was dominated by the O(N)
scans above.

## 3. Fixes and the before/after rate

1. **Per-player log gated** (`utils/players.ts:530`): the 1k log fell from
   12 MB / 659,238 lines to 52 lines; founding 58 → 56 ms.
2. **Indexed identity check** (`clubIdentityTaken`, club-founding.service.ts:130):
   `lower(Name)=lower(?) OR ClubCode=?` makes Postgres `BitmapOr`
   `Clubs_name_ci_unique` and `Clubs_ClubCode_unique` — 0.11 ms vs 1.39 ms seq
   scan at 1k. Codes are always uppercase on this path (`codeProblem` requires
   `[A-Z][A-Z0-9]{1,3}`, `foundClub` uppercases; live `fspro` has 0
   non-uppercase codes).
3. **`resolvePlaces` once + parallel** (`resolveSpotPlaces`): founding used to
   resolve the spot's places twice (name validation + `openPlaces`, 4
   sequential point reads each); now one parallel resolution.
4. **Rating + lineup from the inserted rows** (`createSquad`): the 16 players
   are inserted with `.returning()`, the position averages are computed in
   memory (removing the `Players.ClubId` scan) and the default 4-3-3 XI is
   selected in memory, then a **single** Club update writes Rating fields +
   Lineup + Tactic. Replaces `calculateAndUpdateClubRating` (select+update) and
   `ensureDefaultLineup` (2 selects + update).
5. **Independent post-commit steps overlapped** (`Promise.all`): squad, pyramid
   join, news and (when places open) the frontier update run together; the
   inbox insert follows once the pool is known. 1k: 42 ms sequential → 37 ms.
6. **`advanceFrontier` skipped when no places open** — it only records the
   newest country/region/capital, which can only change when a place opens.

Single client, `SCALE_SKIP_MATCHES=1`, fresh `fspro_b2e`:

| Run | Clubs | ms/club |
| --- | --- | --- |
| before (this worktree, unchanged) | 1,000 | **58** (58 s) |
| after fixes | 1,000 | **38** (38 s) |
| after fixes | 10,000 | **46** (462 s) |

## 4. Concurrency and the 100k run

The per-founding path spends 64% of its time idle (CPU profile) and is floored
at ~30 ms by `placeInPyramid` (outside this agent's ownership). The harness now
takes `SCALE_CONCURRENCY=N`: the placement transaction is serialised by
`PLACEMENT_LOCK`, but the post-commit work overlaps. This models many founders
acting at once — what a 100k first-run world actually is.

| Run | Clubs | Clients | Founding | ms/club | Integrity |
| --- | --- | --- | --- | --- | --- |
| 2k | 2,000 | 4 | 45 s | **23** | 0 warnings, 0 unpooled, 2,000 entries |
| 10k | 10,000 | 4 | 276 s | **28** | 0 warnings, 0 unpooled, 8 countries / 44 regions / 1,000 cities, 160k players / 90k fixtures — identical shape to B2-2D's sequential 10k |
| **100k** | **100,000** | **8** | **3,066 s (51.1 min)** | **31** | 0 warnings, **0 unpooled**, 75 countries / 447 regions / 3,575 cities / 10,000 districts, **100k clubs / 1.6M players / 900k fixtures**, DB 2.1 GB |

100k run (`SCALE_CLUBS=100000 SCALE_CONCURRENCY=8 SCALE_SKIP_MATCHES=1
SCALE_SKIP_YEAR_END=1`, last table):

```
| founding | 100000 clubs in 3066 s (31 ms each) |
| places opened | 75 countries, 447 regions, 10000 cities/districts |
| rows | 100000 clubs, 1600000 players, 900000 fixtures |
| atlas (no club lists) | 288 ms · 1362 KB, 3575 cities |
| atlas (one country's clubs) | 345 ms · 1781 KB |
| placement preview | 12 ms · new-town |
| local news feed | 7 ms · 11 items, local = country |
| one pool table | 8 ms · 10 rows |
| every pool table of a country | 20 ms · 134 pools |
| year end | skipped (SCALE_SKIP_YEAR_END=1) |
```

Integrity queries on the finished 100k DB: `0` unpooled clubs, `100,000`
Entries, `0` clubs without exactly 16 players, `0` clubs without an 11-man
Lineup.

The rate rose gently with size (18 ms @250 → 28 ms @10k → 30 ms @83k → 31 ms
@100k) because of the unowned O(N) costs in §7 — but it is **sub-linear and
bounded**, not the ~300 ms/club of B2-2D's projection. Sequentially the same
100k would be ~1.5–2 h (46 ms at 10k plus the `owned`/`joinPyramid` growth);
with 8 clients it is 51 min.

### Year end

`SCALE_SKIP_YEAR_END=1` was used for the 100k founding timing. The year end is
a separate, O(clubs) bottleneck and is **not** part of the founding rate: at
10k it is 420,948 ms (B2D, reproduced here), dominated by club ratings (334 s)
and youth intake (51 s), so a full 100k year end is projected well past an
hour and is not claimed. This matches `docs/SCALE.md` "Still to do" items 1–2.

## 5. Correctness (R4)

| Check | Command | Result |
| --- | --- | --- |
| `tsc --noEmit` | `apps/fs-pro-server$ ../../node_modules/.bin/tsc --noEmit` | `TSC_EXIT=0` |
| vitest | scratch `vitest@5.0.3` (see note) | **7 files, 95 tests passed** (92 baseline + 3 new) |
| code generator | `node -e` direct check | unique 0..99999 = 100000, format failures/collisions = 0; old `code(0)===code(17576)===ZAAA`, new `code(0)=AAAA`, `code(17576)=ANUI` |
| `checkWorldDistricts.ts` | clone live `fspro` → capture → 0038 → check | **10 checks passed** |
| `checkWorldPyramid.ts` | fresh `fspro_b2e_check` + 0038 + world-service :3007 | **9/9 non-sim assertions pass**; the season step (`every league fixture of the year was played`, `312 !== 0`) is **UNVERIFIED** — the Rust sim service at 127.0.0.1:5050 is not running |
| rating/lineup equivalence | `tmp-verify-b2e.ts` on 200 clubs of the 100k world | rating mismatches **0**, lineup mismatches **0** (validates the in-memory fold against `calculateClubsTotalRatings`) |
| 100k world integrity | SQL counts on `fspro_b2e` | 0 unpooled, 100k entries, 1.6M players, 900k fixtures, every club has an 11-man lineup |

Environment note: this worktree's `node_modules` (a symlink to the main
checkout) does **not** contain `vitest` (the lockfile lists
`apps/fs-pro-server/node_modules/vitest`, not materialized here), so
`cmd.exe /c "npm test"` prints `'vitest' is not recognized`. The identical
suite was run with `vitest@5.0.3` installed in a scratch directory
(`/tmp/opencode/vitestrun`) and symlinked into the app's `node_modules`;
`vitest run` reported 7 files / 95 tests passed. A fresh `npm ci` (Windows
Node) materializes vitest and `npm test` will pass.

## 6. Blockers (R1) — two unowned costs and one missing index each

1. **No index on `Clubs.UserId`.** The club-cap check seq-scans Clubs on every
   founding: 1.1 ms @1k → 3.3 ms @10k (≈1 ms/1,000 clubs). A
   `CREATE INDEX "Clubs_UserId_active_idx" ON "Clubs" ("UserId") WHERE
   "ReleasedAt" IS NULL` (a new migration 0039) removes it.
2. **`joinPyramid` `members` has no `(SeasonId, Group)` index**
   (`pyramid.service.ts:588`): `placeInPyramid` grew 17 → 30 ms from 500 →
   10,000 clubs. `CREATE INDEX ON "Entries" ("SeasonId", "Group")`.
3. **`resolvePlaces`/Players-by-`ClubId`** were handled in owned code here; the
   Players scan is gone, so no index is needed.

Both remaining indexes need a migration. This agent's brief forbids editing
`schema.ts` and migration 0038, so a new migration 0039 was out of scope; it is
reported for the schema owner.

## 7. Known gaps

- **45-min budget missed by ~13%** (51.1 min). The gap is the two §6 costs; the
  per-club code path is exhausted within this agent's ownership.
- The **100k year end was not run** (separate O(clubs) bottleneck, §4).
- `checkWorldPyramid.ts`'s season step is **UNVERIFIED** without the Rust sim.

## 8. Reproduce

```
# scratch DB (do NOT touch fspro / fspro_pyramid_check)
docker exec fs-pro-db-1 pg_dump -U fspro --no-owner --no-privileges -s fspro > schema.sql
psql "$PGURL/postgres" -c 'DROP DATABASE IF EXISTS fspro_b2e' -c 'CREATE DATABASE fspro_b2e'
psql "$PGURL/fspro_b2e" -q -f schema.sql
psql "$PGURL/fspro_b2e" -1 -f apps/fs-pro-server/src/db/drizzle/migrations/0038_world_districts.sql

# world-service against it (Docker, port 3006)
docker run -d --name ws-b2e --network fs-pro_default -p 3006:3006 \
  -v "$WT/services/world-service:/w" -w /w -v ws-go-mod-cache:/go/pkg/mod \
  -e DATABASE_URL='postgresql://fspro:superpassword@db:5432/fspro_b2e' \
  -e WORLD_SERVICE_HOST=0.0.0.0 -e WORLD_SERVICE_PORT=3006 \
  golang:1.24-bookworm sh -c "go build -o /tmp/ws ./cmd/world-service && exec /tmp/ws"

# 1k / 10k / 100k founding
SCALE_CLUBS=1000  SCALE_CONCURRENCY=1 SCALE_SKIP_MATCHES=1 SCALE_SKIP_YEAR_END=1 npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
SCALE_CLUBS=10000 SCALE_CONCURRENCY=4 SCALE_SKIP_MATCHES=1 SCALE_SKIP_YEAR_END=1 npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
SCALE_CLUBS=100000 SCALE_CONCURRENCY=8 SCALE_SKIP_MATCHES=1 SCALE_SKIP_YEAR_END=1 npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
```

Commit on `perfect/b2-2e`; message ends with
`Generated-by: OpenCode sub-agent 2E`.
