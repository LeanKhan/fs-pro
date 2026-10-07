# B1-1C-REPORT.md — Batch 1C (test infrastructure)

Agent: 1C. Branch `perfect/b1-1c`, worktree
`/mnt/c/done/fs-pro/.claude/worktrees/b1c` (`C:\done\fs-pro\.claude\worktrees\b1c`).
Base: `f467ea9` (off `perfect/integration`; integration only had the Batch-1
docs commit ahead at the time).

Environment: the repo `node_modules` is win32-native (BASELINE.md §0), so
everything that touches Vite/Rollup/esbuild runs through **Windows Node**
(`cmd.exe /c "npm ..."`). Go and Rust run through the Windows toolchains via
WSL interop. The dev stack was already running on the machine (API `:3010`,
client `:8080` with `VITE_APP_API_BASE_URL=http://localhost:3010`) and was used
for the e2e run.

---

## 1. What changed

| File | Change |
| --- | --- |
| `package.json` (root) | workspaces `+ "tests/*"`; script `test:e2e` |
| `package-lock.json` | dependency additions (vitest, @playwright/test, workspace) |
| `.github/workflows/ci.yml` | server vitest, scratch client `vue-tsc`, Go-test loop, worldgen guard |
| `apps/fs-pro-server/package.json` | `"test": "vitest run"`, `"test:watch": "vitest"`, devDep `vitest ^5.0.3` |
| `apps/fs-pro-server/vitest.config.ts` | new: node env, `test/**/*.test.ts`, placeholder `DATABASE_URL` |
| `apps/fs-pro-server/test/plan-effects.test.ts` | new, 24 tests |
| `apps/fs-pro-server/test/shop.test.ts` | new, 5 tests |
| `apps/fs-pro-server/test/pyramid.test.ts` | new, 10 tests |
| `apps/fs-pro-server/test/world-geo.test.ts` | new, 25 tests |
| `tests/e2e/package.json` | new workspace `fs-pro-e2e`, devDep `@playwright/test ^1.63.0` |
| `tests/e2e/playwright.config.ts` | new: desktop 1440x900 + mobile 390x844 (chromium) |
| `tests/e2e/specs/core-loop.spec.ts` | new: the core-loop flow |
| `tests/e2e/.gitignore` | ignore generated traces/report |
| `tests/e2e/artifacts/{desktop-1440x900,mobile-390x844}/*.png` | 22 screenshots (evidence) |
| `docs/perfect/B1-1C-REPORT.md` | this report |

No `src/` file was edited (R11). `services/world-service/**`, compose files and
`WORLD-HIERARCHY-SPEC.md` were not touched.

---

## 2. Server vitest (acceptance 1)

Test targets and where the pure surface is:

- `src/services/play/plan-effects.ts:32` `styleKey`, `:39` `styleMatchup`,
  `:48` `counterTo`, `:53` `planTactic`, `:69` `PLAN_TUNING`, `:101`
  `planEffect`, `:142` `nudgeSkills`, `:157` `applyPlanToClub`, `:169`
  `parseSideTactic` — all pure.
- `src/services/competitions/pyramid.service.ts:104` `pyramidShape` and `:73`
  `poolRules` — pure (the file's DB imports are lazy). Shape helper located
  here, as the brief guessed.
- `packages/api-contract/src/world-geo.ts` (re-exported by
  `@repo/api-contract`, `index.ts:154`) — all pure: `countrySpotProblem:59`,
  `townSpotProblem:68`, `suggestTownSpot:87`, `suggestRegionSpot:110`,
  `suggestCountrySpot:132`, `atlasSize:145`, `nameProblem:160`,
  `codeProblem:170`, `tidyName:175`, `suggestCode:178`.
- `src/services/play/shop.ts` — the rate maths lives in the **un-exported**
  `shopRates` (`:40`), which awaits two DB services, so it is not a pure
  module surface. The tests exercise the real rate/storage/pending maths
  through the public `getShop` (`:65`, no DB work of its own) with
  `getAssetEffects` and `getStanding` mocked. **Gap:** the rates cannot be
  tested as a standalone exported function without editing `src/`.

`npm test` (Windows Node):

```
> fs-pro-server@0.1.0 test
> vitest run

 ✓ test/world-geo.test.ts (25 tests)
 ✓ test/shop.test.ts (5 tests)
 ✓ test/pyramid.test.ts (10 tests)
 ✓ test/plan-effects.test.ts (24 tests)

 Test Files  4 passed (4)
      Tests  64 passed (64)
```

Config note (`apps/fs-pro-server/vitest.config.ts`): importing
`pyramid.service`/`shop` transitively reaches `sessionStore.ts:72`, which
throws without `DATABASE_URL`. The config injects a placeholder
`DATABASE_URL`; the `postgres` client is lazy so no connection is made and no
test here touches the DB.

**Why Windows Node:** Linux Node cannot run the suite against the win32-native
tree. Evidence:

```
$ node node_modules/vitest/vitest.mjs run
Error: Cannot find module @rollup/rollup-linux-x64-gnu. npm has a bug related
to optional dependencies ...
```

---

## 3. Playwright e2e (acceptance 2)

New workspace `tests/e2e` with `@playwright/test@1.63.0`. One spec,
`specs/core-loop.spec.ts`, covers: register -> found club -> collect -> PLAY ->
rewards -> Manager hub -> Match prep -> save plan. Two projects:
`desktop-1440x900` and `mobile-390x844` (chromium, `isMobile`/`hasTouch`).

The dev stack was already running, so no stack start was needed. The client is
served with `VITE_APP_API_BASE_URL=http://localhost:3010` (verified by fetching
the dev module `/src/services/api.ts`). Browser cache
(`%LOCALAPPDATA%\ms-playwright\chromium-1243`) already matches Playwright
1.63.0's expected revision 1243, so no `playwright install` was required.

Commands (Windows Node, from `tests/e2e`):

```
$ cmd.exe /c "npx playwright test --project=desktop-1440x900 --reporter=list"
  ✓  1 [desktop-1440x900] › ... core loop ... (1.1m)
  1 passed (1.1m)

$ cmd.exe /c "npx playwright test --project=mobile-390x844 --reporter=list"
  ✓  1 [mobile-390x844] › ... core loop ... (57.4s)
  1 passed (59.5s)
```

The projects were run separately because registration is rate-limited to
**5 sign-ups/hour/IP** (`apps/fs-pro-server/src/middleware/hardening.ts:83`);
running both projects is 2 sign-ups and repeated debugging runs consumed the
budget. Screenshots (11 per project) are committed under
`tests/e2e/artifacts/<project>/`, e.g. `05-campus.png`, `06-collect.png`,
`07-matchmaking.png`, `08-rewards.png`, `09-manager-hub.png`,
`10-match-prep.png`, `11-plan-saved.png`. Verified dimensions:
desktop PNGs 1440x900, mobile PNGs 390x844.

---

## 4. CI (` .github/workflows/ci.yml` )

- **web job**: `npm test --workspace fs-pro-server` (vitest) added after the
  server typecheck; a scratch client `vue-tsc@2.0.29 + typescript@5.4.5`
  step added (same recipe as BASELINE.md §3) and the client build kept.
- **engine job**: the two module-specific Go steps were replaced by one loop
  over every `go.mod` (`find . -name go.mod -not -path './node_modules/*'
  -not -path './.claude/*'`), so `services/world-service` is picked up
  automatically when it lands. `SIM_CORE_CLI_PATH` is set for all modules.
- `cargo test --release` and the `sim-cli` build already existed and are
  unchanged.

Two deliberate choices, both recorded as open questions:

1. The client `vue-tsc` step has `continue-on-error: true` because of the 31
   pre-existing errors (see §5). It still runs and prints the errors.
2. The Go loop **skips `services/worldgen` with a `::warning::`** in a fresh
   checkout: its `go:embed` data trees are gitignored (`.gitignore:29 data`,
   confirmed with `git check-ignore -v`), so a checkout cannot build its tests.
   This is a pre-existing repo defect outside Batch 1C ownership (see OQ1).

`npm install --package-lock-only` reports `up to date`; the lock contains the
Linux optional deps needed by CI (`@rollup/rollup-linux-x64-gnu`,
`@esbuild/linux-x64`) and the `tests/e2e` workspace. `npm ci` itself was not
executed locally (it would delete the working `node_modules`).

---

## 5. Other verification

Client `vue-tsc` (scratch `/tmp/opencode/vuecheck`, vue-tsc@2.0.29 +
typescript@5.4.5):

```
$ /tmp/opencode/vuecheck/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
VUETSC_EXIT=2
31 errors in 14 files
```

The 31 error sites are byte-for-byte the same set as
`docs/perfect/vue-tsc-baseline.log` (`diff` of the two error lists is empty).
Note: `BASELINE.md` §3 prose says "34 errors in 10 files" but the committed log
(and this rerun) has 31 in 14 files — the prose number is off (OQ4). Not fixed,
per the brief.

Client build (Windows Node): `✓ built in 11.24s` (exit 0).

Go / Rust, matching the CI invocations:

```
apps/fs-pro-realtime: go test -count=1 ./...   -> ok  github.com/fs-pro/realtime
services/sim-service: SIM_CORE_CLI_PATH=...sim-cli.exe go test -count=1 ./...
                                             -> ok  .../engine, .../server
services/worldgen:    go test -count=1 ./...
  FAIL fs-pro-worldgen/server [setup failed]
  faces\generator.go:19:12: pattern data/parts/*.json: no matching files found
  names\generator.go:17:12: pattern data/misc/name_arrangements.json: no matching files found
crates/sim-core: cargo test --release
  -> all `test result: ok`; ✓ built
```

The worldgen failure is the gitignored-data issue, reproduced in this fresh
worktree; BASELINE.md ran it in the dev tree where the data was present.

---

## 6. Acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| vitest added to `apps/fs-pro-server` | PASS | `apps/fs-pro-server/package.json`, `vitest.config.ts` |
| tests for plan-effects, shop rates, pyramidShape, world-geo | PASS | `apps/fs-pro-server/test/*.test.ts` (64 tests) |
| `npm test` runs them and passes | PASS | 4 files / 64 tests passed (Windows Node) |
| un-importable/untestable module documented | PASS | `shopRates` note, §2 |
| Playwright workspace `tests/e2e` (devDependency) | PASS | `tests/e2e/package.json` |
| one spec: register -> ... -> save plan | PASS | `specs/core-loop.spec.ts`; desktop + mobile pass |
| screenshots at 1440x900 and 390x844 | PASS | `artifacts/desktop-1440x900/*` (1440x900), `artifacts/mobile-390x844/*` (390x844) |
| CI: go test all modules | PARTIAL | loop in `ci.yml`; worldgen skipped-with-warning (OQ1) |
| CI: cargo test | PASS (pre-existing) | `ci.yml` engine job; verified locally |
| CI: server vitest | PASS | `ci.yml` web job |
| CI: client vue-tsc (scratch pair) | PASS (continue-on-error) | `ci.yml` web job; 31 pre-existing errors |
| CI: client build | PASS | `ci.yml` web job; verified locally |

---

## 7. Gaps and open questions

- **OQ1 (blocker for full CI green): `services/worldgen` embed data is
  gitignored.** `.gitignore:29` (`data`) ignores
  `services/worldgen/faces/data/**` and `services/worldgen/names/data/**`; they
  are untracked (`git ls-files` empty, `git check-ignore -v` confirms) yet are
  required by `go:embed`, so a fresh checkout cannot `go test` worldgen. Fix
  requires editing `.gitignore` (not owned by 1C) and committing ~92 KB of data
  under `services/worldgen/**` (not owned by 1C). Until then CI skips worldgen
  with a warning. **Request to the lead.**
- **OQ2: client `vue-tsc` in CI is `continue-on-error: true`.** 31 pre-existing
  errors (BASELINE's fault list). Remove the flag once they are fixed in a
  later batch, so CI can enforce the typecheck.
- **OQ3: e2e is not wired into CI.** It needs Playwright browsers
  (`npx playwright install --with-deps`) plus the dev stack, and it writes to
  the shared dev DB. Decide DB (scratch `fspro_...`) and whether to add a job.
- **OQ4: BASELINE.md says "34 errors in 10 files"; the committed log and this
  rerun have 31 in 14 files.** Doc correction needed (lead).
- **OQ5: sign-up rate limit (5/hour/IP) makes repeated e2e runs flaky.**
  `middleware/hardening.ts:83`. For CI, seed a session or use a scratch DB.
- Shop rates are only observable through `getShop` with mocks because
  `shopRates` is not exported; a future refactor could export a pure
  `shopRatesFor(fans, capacity, scale)` if standalone unit coverage is wanted.
- `npm ci` was not run locally (it would wipe node_modules); the lock was
  validated with `npm install --package-lock-only` and by checking the Linux
  optional-dep entries.
