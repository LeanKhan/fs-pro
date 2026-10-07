# DECISIONS.md — lead rulings

The owner delegated approvals ("don't ask, just continue"). This file records
the lead's binding decisions so Batch 2+ can proceed without an owner gate.
Each is either the authoring agent's own recommendation or the conservative
option; none contradicts D1–D5 or WORLD-PYRAMID-SPEC.

## A. Spec approval

- **WORLD-HIERARCHY-SPEC.md (Batch 1A) — APPROVED** for implementation in
  Batch 2. It supersedes the geography/placement/pyramid-shape/map parts of
  `WORLD-PYRAMID-SPEC.md` and the map part of `WORLD-VIEW-UI-PLAN.md`, as it
  states in its header. All other parts of WORLD-PYRAMID-SPEC still win.

## B. Answers to WORLD-HIERARCHY-SPEC §11 (Q1–Q8)

| Q | Decision | Rationale |
| --- | --- | --- |
| **Q1** founding lock at 1M | **Keep the single global `PLACEMENT_LOCK`.** Batch 2A must prove O(1) per-founding cost so lock-hold drops to low single-digit ms; only if the 1M benchmark cannot sustain ≥200 foundings/s does sharding by country/region become a follow-up (not this program). | Simplest correct option; the lock already guarantees no overfill. |
| **Q2** capacity defaults | **Accept** `DistrictClubs=10`, `CityDistricts=2`, `RegionCities=8`, `CountryRegions=6`, `MetropolisDistricts=40`. | Spec's recommendation; keeps 1 district ≈ 1 pool. All are world settings, tunable later without migration. |
| **Q3** district naming / UI rename | **Auto-name** new districts `"<City> <Compass word>"` via the existing `regionName` fallback. Rename **data model** town→city and add district. UI: show `City › District`; a full string rename is allowed where cheap but not required. | Avoids a fourth founding-name field; no gameplay value in naming a district. |
| **Q4** prominence caps/weights | **Accept** caps (Elo 1200–2400, Level 20, Fans 10^6, Rep 100, DIV_MAX 14) and weights 0.30/0.25/0.20/0.15/0.10. | Shape decisions with sane ranges; sum to 1. |
| **Q5** unbounded sea | **Keep unbounded** for this program. No world bound. | Integer quadtree coords handle growth; a bound is an unrelated product decision. |
| **Q6** `PlaceStats` maintenance | **DB trigger** on `Clubs` (INSERT/DELETE/UPDATE OF DistrictId). | Correct regardless of which writer (Node or Go) changes clubs; one source of truth. |
| **Q7** news scopes | **Add `district`/`city` scopes in Batch 2**, mapping legacy `town` → district. Keep escalation smallest→widest. | Finishes the 4-level tree in the news scope model; cheap while the migration is open. |
| **Q8** district-name source | **Existing `regionName` compass fallback until Batch 4**, then switch to the country's culture bank. | Does not block the schema; Batch 4 owns culture naming. |

## C. Process rulings

- Batch 1A's spec is not blocked on an owner reply; Batch 2 build agents start
  once `VERIFY-B1` passes.
- `go test -race` runs in `golang:1.24-bookworm` (Docker).
- Client build/typecheck run through **Windows Node**; server/DB work may use
  Linux Node.
- Scratch DBs (`fspro_pyramid_check`, `fspro_scale_100k`) are the only
  destructive targets; the dev DB `fspro` is off-limits.

## D. Batch 2 restructure (R11)

The owner's 2A (placement+hierarchy) and 2B (ranking+pyramid) both edit
`services/world-service/**` and Node files, which breaks R11 (no two agents in
a batch edit one file). Batch 2 is split **by layer**:

- **2A — Go service + schema**: `services/world-service/**`, migration
  `0038_world_districts.sql`, `schema.ts`.
- **2B — Node integration + contracts**: Node world/pyramid services, a new
  world-service HTTP client, `packages/api-contract/**`, `route-policy.ts`.
- **2C — checks + 100k scale** (staged after 2A/2B): `checkWorldPyramid.ts`,
  `seedScaleWorld.ts`, `SCALE.md`.

The HTTP boundary is frozen in `docs/perfect/WORLD-SERVICE-CONTRACT.md`; both
implement it verbatim.

## E. Batch 2A open questions (Q-A–Q-D)

| Q | Decision |
| --- | --- |
| **Q-A** prominence worked example | **Implement the §5.1 formula**, not the worked "new club ≈ 11.9" (the formula gives ≈16.2). The worked number is a spec typo. 2A's implementation stands. |
| **Q-B** frontier city | **One "capital" per frontier country**: the oldest city of the newest non-full country may grow to `MetropolisDistricts`. Accept 2A's implementation; the spec's "most recently created city" wording is the error. |
| **Q-C** `PlacementSpot` x/y for multi-level creation | Accept 2A's semantics: `districtId` is the leaf; when `kind` is `city`/`region`/`country`, Node creates the levels in `needsNames` and uses the returned `x,y` as the anchor. 2C implements this. |
| **Q-D** frontier pointer | The `spot` call is pure-read; **Node advances `Calendars.Frontier*` after a successful founding** (2C). `spot` validates/recomputes the hint. |

## F. Scale-harness finding (Batch 0/2C)

`seedScaleWorld.ts` plays every fixture through the sim service unless
`SCALE_SKIP_MATCHES=1` (`src/scripts/seedScaleWorld.ts:100`). Run without it
and without the sim service up, each of ~90k fixtures retries 3× against
127.0.0.1:5050 → the run appears to hang (measured: >1h16m before kill). Batch 0's
10k numbers must be produced with `SCALE_SKIP_MATCHES=1` (founding/draw/year-end
timings) and, separately, with the sim service up if match throughput is wanted.
