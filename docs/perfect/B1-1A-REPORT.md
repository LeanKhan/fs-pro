# B1-1A-REPORT.md — Batch 1A world model spec

Agent: Batch 1A. Branch `perfect/b1-1a` (worktree
`/mnt/c/done/fs-pro/.claude/worktrees/b1a`, base `f467ea9`
`perfect/integration`). Everything below was run/read in that worktree.

## 1. What changed

| File | Status | Lines |
| --- | --- | --- |
| `docs/perfect/WORLD-HIERARCHY-SPEC.md` | new | 777 |
| `docs/perfect/B1-1A-REPORT.md` | new (this file) | — |

Nothing else was touched. No code, no other docs, no migrations written
(migration 0038 is *specified* in the spec §2.3 only, per R7). No Batch 2 work
started.

## 2. Commands run (with output)

Reads (`read`) of the R5 docs and of the code are listed as tool calls, not
shell commands; the shell commands and their final lines follow.

### 2.1 Git / worktree

```
$ git worktree list
/mnt/c/done/fs-pro                        f467ea9 [perfect/integration]
/mnt/c/done/fs-pro/.claude/worktrees/b1a  f467ea9 [perfect/b1-1a]
/mnt/c/done/fs-pro/.claude/worktrees/b1b  f467ea9 [perfect/b1-1b]
/mnt/c/done/fs-pro/.claude/worktrees/b1c  f467ea9 [perfect/b1-1c]

$ git rev-parse --abbrev-ref HEAD
perfect/b1-1a

$ git status --short          (before writing the report)
?? docs/perfect/WORLD-HIERARCHY-SPEC.md
```

### 2.2 Locating the code the spec describes

```
$ find apps/fs-pro-server/src -iname '*pyramid*' -o -iname '*round-robin*' -o -iname 'world-geo*'
apps/fs-pro-server/src/db/drizzle/migrations/0035_world_pyramid.sql
apps/fs-pro-server/src/scripts/checkWorldPyramid.ts
apps/fs-pro-server/src/scripts/migration/start-world-pyramid.ts
apps/fs-pro-server/src/services/competitions/pyramid.service.ts
apps/fs-pro-server/src/utils/round-robin.ts

$ find . -path ./node_modules -prune -o -name '*.sql' -print | sort | tail -3
./apps/fs-pro-server/src/db/drizzle/migrations/0035_world_pyramid.sql
./apps/fs-pro-server/src/db/drizzle/migrations/0036_email_auth.sql
./apps/fs-pro-server/src/db/drizzle/migrations/0037_clubs_entity_id.sql
```

### 2.3 The advisory lock cited in the spec (placement.service.ts:34-38)

```
$ grep -n "PLACEMENT_LOCK\|lockPlacement\|pg_advisory" \
    apps/fs-pro-server/src/services/world/placement.service.ts \
    apps/fs-pro-server/src/services/competitions/pyramid.service.ts
.../placement.service.ts:24: * the club in the same transaction, under PLACEMENT_LOCK, so two foundings
.../placement.service.ts:33:/** pg_advisory_xact_lock key shared by everything that adds clubs to towns. */
.../placement.service.ts:34:export const PLACEMENT_LOCK = 0x46535050; // "FSPP"
.../placement.service.ts:36:export async function lockPlacement(tx: Tx) {
.../placement.service.ts:37:  await tx.execute(sql`select pg_advisory_xact_lock(${PLACEMENT_LOCK})`);
.../placement.service.ts:158: * lockPlacement() for a binding answer; outside it, it's a preview.
.../pyramid.service.ts:259:  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pyramid:${competitionId}`}))`);
.../pyramid.service.ts:519:  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pyramid:${competitionId}`}))`);
```

### 2.4 Whole-world atlas evidence

```
$ grep -n "FULL_ATLAS_CLUBS\|atlasSize\|clubsLoaded" apps/fs-pro-server/src/services/world/atlas.service.ts
5:  atlasSize,
37:const FULL_ATLAS_CLUBS = 600;
133:  const all = total <= FULL_ATLAS_CLUBS;
209:  const size = atlasSize([...countries, ...regions, ...towns].map((p) => ({ x: p.MapX ?? 0, y: p.MapY ?? 0 })));
216:  clubsLoaded: all ? 'all' : countryId ? { countryId } : null,

$ grep -rn "getAtlas" apps/fs-pro-client/src --include=*.vue
apps/fs-pro-client/src/views/game/found-club.vue:332
apps/fs-pro-client/src/views/game/world-map.vue:499
```

### 2.5 Migration runner facts (why 0038)

```
$ read app.../src/scripts/migration/apply-sql-migrations.ts
23: const FIRST_UNJOURNALED = 15;
37: const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f) && Number(f.slice(0, 4)) >= FIRST_UNJOURNALED)...
50-53: await sql.begin(async (tx) => { await tx.unsafe(text); await tx`INSERT INTO "SqlMigrations"(name) ...`; })
```

### 2.6 Final size/headings check

```
$ wc -l docs/perfect/WORLD-HIERARCHY-SPEC.md
777 docs/perfect/WORLD-HIERARCHY-SPEC.md

$ grep -n "^## \|^### " docs/perfect/WORLD-HIERARCHY-SPEC.md
22:## 0. Terms ...
39:## 1. What exists today (evidence)
79:## 2. Data model: district as a `Places` level (recommendation)
199:## 3. Capacity and growth rules
311:## 4. Placement algorithm
397:## 5. Prominence score
454:## 6. Pyramid at scale
552:## 7. Map tiling
658:## 8. Every section of `WORLD-PYRAMID-SPEC.md` this spec changes
714:## 10. Acceptance mapping (B1-1A brief → this spec)
728:## 11. Open Questions
770:## 12. Explicit non-goals
```

## 3. Acceptance items → where in the spec

| Brief acceptance item | Spec location | Notes |
| --- | --- | --- |
| 1. District data model vs alternatives; exact migration + backfill of towns → city+district | **§2** (2.1 recommendation, 2.2 rejected alternatives, 2.3 `0038_world_districts.sql` step list + tested backfill) | Migration file named, steps specified, SQL *not* written (R7). |
| 2. Capacity/growth: when a district opens; when a city is a metropolis; invites at city/district; honour WORLD-PYRAMID-SPEC "Fill order"/"Invites" | **§3** (3.1 settings, 3.2 district opening, 3.3 metropolis, 3.4 fill order, 3.5 naming, 3.6 invites) | Cites WORLD-PYRAMID-SPEC `:63,:65,:94` and `placement.service.ts`. |
| 3. Placement algorithm with complexity, locking (cite pg advisory lock), fairness | **§4** (4.1 lock cited `placement.service.ts:33-38`; 4.2 O(1) counters+frontier; 4.3 transaction boundary; 4.4 fairness) | Cites 75/118 ms baseline (`SCALE.md:17`). |
| 4. Prominence from stored fields (Division, Level, Elo, Fans, Reputation): exact formula, ties, recompute | **§5** (5.1 formula, 5.2 tie-breaks, 5.3 recompute cache) | Only stored fields; weights sum to 1. |
| 5. Pyramid at scale (100/10k/100k), locality, mid-season, promotion/relegation, winnable first pool | **§6** (6.1 sizes table, 6.2 locality, 6.3 mid-season, 6.4 promotion/relegation, 6.5 power bands) | Worked division shapes for the 3 sizes. |
| 6. Map tiling: zoom table, key scheme (quadtree/geohash vs place-tree), budget, caching, invalidation; D2 no whole-world | **§7** (7.2 zoom table, 7.3 quadtree + rejected alternatives, 7.4 ≤60 KB budget, 7.5 caching/invalidation, 7.6 `getAtlas` retirement) | D2 enforced at every zoom. |
| 7. List every section of WORLD-PYRAMID-SPEC.md and other docs changed | **§8** (8.1 other docs) | Per-section table with line ranges. |

Method requirements met:
- Every current-behaviour claim carries a `file:line` (§1 lists the main ones;
  the body cites throughout). No hallucinated APIs (R2): the Go surface in §9 is
  labelled **proposed**, not existing.
- R1: facts I could not establish are in **§11 Open Questions** (8 items), not
  guessed.

## 4. Known gaps

1. **No code was read at runtime beyond static inspection.** No DB query, no
   benchmark, no `psql` was run; the spec is a design document and does not
   claim measured behaviour beyond what `docs/SCALE.md` already records.
2. **Migration 0038 is specified, not exercised.** It has not been applied to
   any database; the backfill check in §2.3 is a specification for Batch 2A to
   implement (R7).
3. **The Go world-service is proposed.** `services/world-service` does not exist
   yet (`ls services/` → `sim-service`, `worldgen`); §9 is the intended surface
   for Batch 1B.
4. **Prominence weights/caps and capacity defaults are recommendations**, flagged
   as Q2/Q4 for owner confirmation; the rules are independent of them.
5. **News scopes** (`district`/`city`) and **culture naming** are flagged as
   impacted/adjacent but not fully designed (Q7/Q8) — they belong to Batch 2/4.
6. **Owner approval gate**: per the brief, Batch 2 must not start until the
   owner approves this spec.

## 5. Open questions (full text in spec §11)

Q1 founding-lock throughput at 1M · Q2 capacity defaults · Q3 district naming /
town-vs-city UI rename · Q4 prominence normalisation and weights · Q5 unbounded
sea vs a world bound · Q6 `PlaceStats` trigger vs world-service maintenance ·
Q7 news-scope district/city · Q8 culture naming source (D3/Batch 4).

## 6. Commit

Committed on `perfect/b1-1a` only; message ends with the required attribution
line. No other branch, worktree or remote was touched.
