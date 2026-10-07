# B2-2B-REPORT.md — Batch 2B (typed contract + world-service HTTP client)

Agent: 2B (`perfect/b2-2b`). Worktree
`/mnt/c/done/fs-pro/.claude/worktrees/b2b`
(`C:\done\fs-pro\.claude\worktrees\b2b`). Base `perfect/integration` @ `0c9971f`.

Scope note (from the brief): the heavy Node rewiring of
placement/founding/pyramid depends on 2A's `schema.ts` district columns and is
**deferred to a follow-up agent**. This batch is the independent half: the
zod contract for the Go endpoints and the thin HTTP client everything will
use. **No public Node route was added**, so no `route-policy.ts` rule and no
ts-rest contract route were needed (R6); the client is server-to-server.

---

## 1. What changed (files owned)

| File | Change |
| --- | --- |
| `packages/api-contract/src/schemas/world-service.ts` | **new** — zod schemas + inferred types for every shape in `WORLD-SERVICE-CONTRACT.md`: `PlacementSpot` (+ request/kind/invite), `PlaceChild`/`PlaceChildren`, `Prominence` (+ recompute request/result), `PyramidPool`/`PyramidDraw`, `PyramidJoin` (+ request), `WorldServiceHealth`. |
| `packages/api-contract/src/index.ts` | export the schemas and the inferred types (request types included). |
| `apps/fs-pro-server/src/services/world/world-service.client.ts` | **new** — thin `fetch` client, `WORLD_SERVICE_URL` (default `http://localhost:3006`), throws on non-2xx, parses each response with the contract schema. |
| `apps/fs-pro-server/test/world-service-schemas.test.ts` | **new** — 17 vitest cases: valid + invalid parse per shape. |
| `apps/fs-pro-server/test/world-service-client.test.ts` | **new** — 11 vitest cases: URL/method/body/header building, response parsing, non-2xx throw, schema-mismatch throw, default base URL. |

No Go, no migration `0038`, no `schema.ts`, no existing placement/founding/
pyramid service, no `route-policy.ts`, no script was touched (R11). The five
files above are the whole diff (`git status --porcelain`, §2.4).

`services/world-service/internal/http/server.go` was **read only** — see the
2A hand-off note in §4.

---

## 2. Commands run (each with its last lines)

All server/client commands run through Windows Node
(`cmd.exe /c "npm ..."`) because the repo `node_modules` is win32-native
(BASELINE.md §0). The worktree had no `node_modules` and `vitest` is absent
from the main checkout (`ls node_modules/.bin | grep vitest` → empty), so I
linked the known-good win32 install from the `b1c` worktree into `b2b` with
real Windows junctions (details in §3, environment note).

### 2.1 `npm test` (acceptance: schemas + client)

```
> fs-pro-server@0.1.0 test
> vitest run

 RUN  v5.0.3 C:/done/fs-pro/.claude/worktrees/b2b/apps/fs-pro-server

 ✓ test/plan-effects.test.ts (24 tests) 18ms
 ✓ test/world-service-schemas.test.ts (17 tests) 16ms
 ✓ test/world-service-client.test.ts (11 tests) 22ms
 ✓ test/world-geo.test.ts (25 tests) 23ms
 ✓ test/shop.test.ts (5 tests) 7ms
 ✓ test/pyramid.test.ts (10 tests) 116ms

 Test Files  6 passed (6)
      Tests  92 passed (92)
   Duration  1.89s
```

The two new files contribute **28** of the 92 tests; the other 64 are the
Batch 1C suite, still green.

### 2.2 `npm run tsc` (server typecheck)

```
> fs-pro-server@0.1.0 tsc
> tsc
```

(exit 0, no output). See §3 for why the app-level `@types/node@26` from the
borrowed install had to be removed first; the repo's own main checkout runs
the same command clean at the same base commit.

### 2.3 `npm run build --workspace @repo/api-contract`

```
> @repo/api-contract@0.0.0 build
> tsc
```

(exit 0, no output). Emitted `dist/schemas/world-service.{js,d.ts}`.

### 2.4 `git status --porcelain`

```
 M packages/api-contract/src/index.ts
?? apps/fs-pro-server/src/services/world/world-service.client.ts
?? apps/fs-pro-server/test/world-service-client.test.ts
?? apps/fs-pro-server/test/world-service-schemas.test.ts
?? packages/api-contract/src/schemas/world-service.ts
```

`node_modules` and `packages/api-contract/dist` are git-ignored
(`git check-ignore` confirms), so they are not part of the commit.

---

## 3. Environment note (why the worktree needed node_modules)

- The `b2b` worktree ships with no `node_modules`, and the main checkout
  `/mnt/c/done/fs-pro/node_modules` has **no `vitest`** even though
  `package-lock.json` contains it (`apps/fs-pro-server/node_modules/vitest`,
  B1C), i.e. the main install is stale relative to the lock.
- I built `b2b/node_modules` as a real directory of Windows junctions into
  `b1c/node_modules` (which has the win32 vitest install), with `@repo/*` and
  the `fs-pro-*` workspace links re-pointed at `b2b` so the contract under
  test is **this** worktree's source. `b2b/apps/fs-pro-server/node_modules`
  was copied from `b1c` (6.4 MB, includes `vitest`). `node_modules` is
  untracked/ignored and is **not** committed.
- The copied app tree contained `apps/fs-pro-server/node_modules/@types/node@26.6.4`
  — a vitest optional peer that the lockfile pins. The server tsconfig sets
  `typeRoots: ["./node_modules/@types", ...]`, so that copy **shadows** the
  repo's `@types/node@20.19.17` and produces a spurious, unrelated
  `imagination-auth.service.ts(162,76): error TS2694: Namespace '"crypto"'
  has no exported member 'JsonWebKey'`. Reproduced in the `b1c` worktree with
  the same install; the main checkout (no app-level `@types/node`) passes.
  I renamed the local copy (`@types` → `@types.bak`) and `npm run tsc` then
  passed. This is a **B1C/lockfile observation, not a 2B file** — recorded in
  §4 for the lead/verifier.

---

## 4. Acceptance items + evidence

| # | Criterion (brief) | Evidence |
| --- | --- | --- |
| 1 | zod schemas for every contract shape, in `schemas/world-service.ts`, exported from `index.ts` (types + schemas, request types too) | `packages/api-contract/src/schemas/world-service.ts`; `git diff packages/api-contract/src/index.ts` (36 added lines); `@repo/api-contract` build exit 0 |
| 2 | Thin `fetch` client for the Batch-2 endpoints + health, `WORLD_SERVICE_URL` default `http://localhost:3006`, typed with the inferred types, throws on non-2xx, no SDK/axios | `apps/fs-pro-server/src/services/world/world-service.client.ts`; client tests §2.1 |
| 3 | No public Node route; no route-policy change | `git status` §2.4 shows no `route-policy.ts` diff; the client is only imported nowhere yet (deferred wiring) |
| 4 | Vitest tests: parse valid + reject invalid per shape; URL-building/error handling with `fetch` mocked; `npm test` runs them | §2.1: `world-service-schemas.test.ts` 17 passed, `world-service-client.test.ts` 11 passed |

Shapes implemented literally from `docs/perfect/WORLD-SERVICE-CONTRACT.md`:
`PlacementSpot` (§1), `PlaceChild`/`PlaceChildren` (§2), `Prominence` and
`{clubIds}`→`{updated}` (§3), `PyramidPool`/`PyramidDraw` and `PyramidJoin`
(§4), health (§5). The client exposes:
`getPlacementSpot`, `getPlaceChildren`, `getProminence`,
`recomputeProminence`, `drawPyramid`, `joinPyramid`, `worldServiceHealth`,
`worldServiceHealthy`.

### Ambiguities, implemented literally (R1)

1. **Endpoint count.** The brief says "the five Batch-2 endpoints + health",
   but the frozen contract lists **six** Batch-2 endpoints
   (`POST /placement/spot`, `GET /places/{id}/children`,
   `GET /prominence/{clubId}`, `POST /prominence/recompute`,
   `POST /pyramid/draw/{competitionId}`, `POST /pyramid/join`) and names six
   shapes. I implemented all six + health, because the contract is the
   authority and "implement this verbatim" is explicit.
2. **`ProminenceRecompute` naming.** The contract labels only the request
   `{ "clubIds": [...] }`; the response `{ "updated": n }` is unnamed. I added
   `ProminenceRecomputeResultSchema` for that literal response so the client
   can type it. No extra fields were invented.
3. **Ids.** The contract annotates ids as `uuid`; the repo's existing schemas
   (`schemas/atlas.ts`, `schemas/player.ts`) use plain `z.string()` for `_id`
   fields. I followed the repo style (`z.string()`), so ids are not
   UUID-validated; the shapes still reject wrong types/enums/missing fields.
4. **`updatedAt`** is `z.string().nullable()` (contract: RFC3339-or-null), not
   a strict datetime format, so `+00:00` and `Z` both pass.
5. **Health.** The Go handler returns `503` when its DB ping fails; the
   client's rule is "throw on non-2xx", so `worldServiceHealth()` throws and
   `worldServiceHealthy()` mirrors worldgen's boolean helper.

### Hand-off to 2A (read-only finding, not edited)

The frozen contract paths differ from the Batch 1B Go skeleton at
`services/world-service/internal/http/server.go:63-67`, which still registers
`POST /placement/found`, `GET /ranking/prominence`, `POST /pyramid/pools`
(placeholders answering 501). 2A must register the contract paths
(`/placement/spot`, `/places/{id}/children`, `/prominence/{clubId}`,
`/prominence/recompute`, `/pyramid/draw/{competitionId}`, `/pyramid/join`) or
the client will 404/501. I did not touch Go (R11 / brief).

---

## 5. Known gaps

- The client is not wired to any caller yet; placement/founding/pyramid still
  use the existing Node code. **That rewiring is deferred to a follow-up
  agent and needs 2A's `schema.ts` district columns** (see §6). Until then
  `world-service.client.ts` is exercised only by its unit tests.
- The client uses `WORLD_SERVICE_URL` but no compose/env entry was added for
  it (out of scope: compose/`.env` files are not in my ownership list). A
  follow-up should add the default to the server env docs.
- `go test` was not run (I changed no Go).

---

## 6. Open questions

1. **Node rewiring deferred to follow-up, needs 2A's `schema.ts`.** The brief
   splits Batch 2 by layer; the placement/founding/pyramid integration that
   will *call* this client is scheduled after 2A lands the district columns in
   `db/drizzle/schema.ts` (and migration `0038`). No integration code was
   changed here.
2. **Go route alignment (2A).** Confirm 2A will register the contract paths
   above (the skeleton does not). The contract is frozen, so this is a
   mechanical rename; flagged rather than assumed.
3. **`@types/node@26` shadow (B1C/lockfile).** The lockfile pins an
   app-level `@types/node@26.6.4` (vitest optional peer) that breaks
   `apps/fs-pro-server` `tsc` via `typeRoots`. A fresh install will reproduce
   it. Owner of the lockfile/config (B1C or the lead) should decide: drop the
   peer, pin `@types/node@20` at the app, or remove `typeRoots`' app-level
   lookup. Not a 2B file.
