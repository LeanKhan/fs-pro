# B3-3C-REPORT.md — phase 2, Batch 3, Agent 3C

**Branch:** `p2/b3-3c` (worktree `.claude/worktrees/p2b3c`, from `p2/integration`
@ `31e46f9`, which contains 3A + 3B). **Scope (brief):** wiring, the Villa sweep
and the end-to-end proof. **Status: delivered.** Server `tsc` + 151 vitest
tests green; client `vue-tsc` at the 31-error baseline and the client build
clean; the money-symbol grep is zero; the whole new-owner flow passes on the
real stack at 1440x900 and 390x844 with the cross-device check.

Deliverables per the brief:

1. Replace the device-local first steps (`club-game.vue` localStorage
   `fspro_steps_<id>`) with the **server** program state (L8).
2. The Node proxy route `POST /program/:clubId/tip` -> world-service
   `programTip()`, with a route-policy rule (3A hand-off).
3. Tip triggers + inbox/news hooks per the spec.
4. Switch every client money display to the shared Villa formatter (L13).
5. Playwright: the whole new-owner flow on desktop 1440x900 and mobile
   390x844, screenshots, plus a cross-device check.

Ownership (R11): I owned `club-game.vue` first-steps, the new tip proxy +
route-policy, money-display edits across the client, and `tests/e2e`. I did
**not** rewrite 3A/3B component internals; the only 3A-file change is the
documented tip seam (`use-advisor.ts`): send the session event and the session
cookie (both required for the proxy to work cross-origin).

---

## 1. What shipped

| # | Deliverable | Files |
| --- | --- | --- |
| 1 | Server program state replaces the device-local first steps | `apps/fs-pro-client/src/views/game/club-game.vue` |
| 2 | Tip proxy + route-policy | `packages/api-contract/src/routes/program.ts`, `apps/fs-pro-server/src/controllers/program/program.router.ts`, `apps/fs-pro-server/src/services/program/owner-program.service.ts`, `apps/fs-pro-server/src/middleware/route-policy.ts` |
| 3 | Tip triggers + inbox/news hooks | `apps/fs-pro-server/src/services/program/program-facts.service.ts`, `.../squad-gate.ts`, `.../program-notifications.service.ts` (new), `.../owner-program.service.ts`, `db/drizzle/schema.ts`, `apps/fs-pro-client/src/components/cozy/advisor/use-advisor.ts` |
| 4 | Villa money sweep | `components/media/general-media-card.vue`, `composables/use-owner-program.ts`, `views/user/club/zones/owner-zone.vue`, `components/cozy/cozy-campus.vue` |
| 5 | End-to-end Playwright | `tests/e2e/specs/owner-journey.spec.ts` (new) + `tests/e2e/artifacts/**/owner-journey/` |

### 1.1 Server program state replaces the localStorage first steps (L8)

`club-game.vue` no longer reads `fspro_steps_<id>`. The `fspro_steps_*`
key, `stepFlags`, `markStep()` and the old five device-local steps are gone.
The HUD checklist and the onboarding pointer now come from
`fetchProgramState(clubId)`:

- `firstSteps` maps the four server steps (`manager`, `players`, `facilities`,
  `level1`) with `done` from `stepStars`/step order; `coach` is the current
  server step.
- The checklist entries are keyed `p-manager`, `p-players`, `p-facilities`,
  `p-level1`; `onAct` routes any `p-` action to the owner-program screen.
- The `.program-chip` entry and the advisor remain the prominent campus UI.

### 1.2 The tip proxy (3A hand-off)

- `packages/api-contract/src/routes/program.ts`: new `program.tip` route
  (`POST /program/:clubId/tip`) whose body is the Go-boundary
  `ProgramAdvisorState` plus `now` and optional session `events`, answering the
  Go-boundary `ProgramTipResponse` (`{ tip: AdvisorLine | null }`).
- `owner-program.service.ts`: `getTip()` re-derives the club's `StepFacts`
  from the DB (`buildStepFacts`), merges the server-side `OwnerProgram.DismissedTips`
  with the client's, and forwards to the pure Go `programTip()`. Tips are silent
  once the program is `done`.
- `program.router.ts`: the `tip` handler.
- `route-policy.ts`: `'program.tip': { club: param('clubId') }`.
- `use-advisor.ts`: the tip `$axios.post` now sends `withCredentials: true`.
  Without it the API rejected the cross-origin request 401 and the advisor
  silently fell back to the step line (proved in the debug run before the fix).

### 1.3 Tip triggers + inbox/news hooks

- `events.playBlocked` is now real: `assertClubPlayable` records the refusal
  (`OwnerProgram.Scout.playBlockedAt`) and `buildStepFacts` maps it to
  `tip.play.gate` for 15 minutes (`PLAY_BLOCKED_TTL_MS`).
- `events.sessionMinutes` is sent by the advisor store from
  `performance.timeOrigin`, so `tip.idle.break` can fire.
- `program-notifications.service.ts` writes a per-step inbox card and, at
  Level 1, a local-news story. Money in the text is Villa (`formatVilla`).
- Wired into `refreshProgram` after the conditional `recordAndAdvance` wins, so
  each milestone fires at most once per club and never rolls back the advance.

### 1.4 Villa sweep (L13)

Every client money display already funnelled through `currency()`/`money()`
(which delegate to `formatVilla`). The remaining raw-number/symbol sites were
fixed:

- `general-media-card.vue`: `Valuation: ${{ n.toLocaleString() }}` ->
  `formatVilla(n)`.
- `use-owner-program.ts`: three toasts (`... V.`) -> `formatVilla(...)`.
- `owner-zone.vue`: last-gate net money -> `formatCurrency`.
- `cozy-campus.vue`: the shop collector bubble -> `formatVillaCompact`.

Acceptance grep (text sources; binaries excluded):

```
$ grep -rnE '\$[0-9]|\$\$|€|£|["'"'"']\$["'"'"']' \
    apps/fs-pro-client/src packages/api-contract/src apps/fs-pro-server/src \
    --include='*.ts' --include='*.vue' --include='*.scss'
ZERO money-symbol matches (client + api-contract + server)
```

---

## 2. Commands and evidence (R4)

All commands ran through **Windows Node** (`cmd.exe`), matching `BASELINE.md`.

### 2.1 Server typecheck (`tsc`)

```
$ npm run tsc --workspace fs-pro-server
> tsc
EXIT=0
```

### 2.2 Server unit tests (`vitest`)

```
$ npm test --workspace fs-pro-server
 Test Files  15 passed (15)
      Tests  151 passed (151)
   Duration  13.87s
```

### 2.3 Client typecheck (`vue-tsc`, pinned scratch)

```
$ %TEMP%\node_modules\.bin\vue-tsc.cmd --noEmit -p apps\fs-pro-client\tsconfig.json
31           # error count == docs/perfect/vue-tsc-baseline.log (unchanged)
$ grep -E "error TS" <log> | grep -iE "advisor|cozy-campus|club-game|owner-program|use-owner-program|general-media|owner-zone"
NO errors in 3C files
```

### 2.4 Client + api-contract build

```
$ npm run build --workspace @repo/api-contract
> tsc                                        # clean
$ npm run build --workspace fs-pro-client
✓ built in 11.76s
```

### 2.5 Money-symbol grep (L13 acceptance)

```
$ grep -rnE '\$[0-9]|\$\$|€|£|["'"'"']\$["'"'"']' \
    apps/fs-pro-client/src packages/api-contract/src apps/fs-pro-server/src \
    --include='*.ts' --include='*.vue' --include='*.scss'
ZERO money-symbol matches (client + api-contract + server)
```

### 2.6 The real stack + Playwright

The real stack was brought up (not mocked):

- Postgres: the migrated `fspro_p2c_seed2` scratch DB (2C's world seed:
  5,054 free agents, 1,004 free managers) on `localhost:5434`.
- Go world-service (Windows `go run`): `localhost:3016`
  (`{"status":"ok","database":"up"}`).
- Rust sim service: `cargo build --release` in `crates/sim-core` (21s) then the
  Go service on `localhost:5050` — required because matches have **no**
  in-process fallback (`jobs/matchQueue.ts:1-11`).
- Node API: `localhost:3010` (`ts-node-dev`, `GAME_TIME_SCALE=50`,
  `RATE_LIMIT=off`).
- Client: Vite dev `localhost:8080` (`VITE_APP_API_BASE_URL=http://localhost:3010`).

Backend smoke (real HTTP, pasted verbatim) — registration -> placement ->
founding -> program read -> the new tip proxy:

```
POST /api/users/join   -> {"success":true,...}
GET  /api/atlas/placement -> {"kind":"town","town":{"name":"Dha Marm Central"},...}
POST /api/atlas/clubs  -> {"success":true,"payload":{"clubId":"bcd8ad4c-...","pool":null}}
GET  /api/program/<id> -> {"step":"manager","startingBalance":1400000,
  "advisor":{"id":"step.manager.arrive",...}}
POST /api/program/<id>/tip -> {"payload":{"tip":{"id":"balance.reveal",
  "text":"We drew V1.4M. Enough for a manager, a hard-working squad and one
  good building — not all three done well. Choose.","expr":"worried",...}}}
```

(Playwright screenshots and result pasted in §2.7.)

### 2.7 Playwright — the whole new-owner flow (real stack)

```
$ set E2E_BASE_URL=http://localhost:8080
$ set E2E_API_URL=http://localhost:3010
$ npx playwright test specs/owner-journey.spec.ts --reporter=list

  ✓  1 [desktop-1440x900] › new owner journey: register -> found -> manager ->
     squad -> build -> Level 1 -> league (2.1m)
  1 passed (2.1m)

$ npx playwright test specs/owner-journey.spec.ts --project=mobile-390x844 --reporter=list
  ✓  1 [mobile-390x844] › new owner journey: register -> found -> manager ->
     squad -> build -> Level 1 -> league (1.9m)
  1 passed (2.0m)
```

Both viewports pass. The screenshots show a real club: `03-balance-reveal` a
drawn `V4M`; `10-league-joined` "Your league has a name now", `Bellean League ·
Year 8 · Division 2 · Bellean D2 · Bellean Central III`, the club in the pool
table and its first fixture — all money in Villa.

Screenshots: `tests/e2e/artifacts/<project>/owner-journey/`:
`01-register`, `02-campus-advisor`, `03-balance-reveal`, `04-managers`,
`05-manager-negotiate`, `06-squad-empty`, `07-facilities`, `08-level1-push`,
`09-friendly-rewards`, `10-league-joined`, `cross-device-second-context`.

---

## 3. Acceptance criteria -> evidence

| Criterion (brief) | Status | Evidence |
| --- | --- | --- |
| localStorage first steps replaced by server program state (L8) | PASS | `club-game.vue` (`fspro_steps_*` gone; `firstSteps`/`coach` from `fetchProgramState`) |
| `POST /program/:clubId/tip` proxy + route-policy | PASS | smoke §2.6 (`balance.reveal` tip in Villa); `program.tip` policy |
| Tip triggers per the spec | PASS | `playBlocked` from the gate ledger; `sessionMinutes` from the store; the rest server-side (Go tables) |
| Inbox/news hooks | PASS | `program-notifications.service.ts`; smoke/welcome message; Level-1 news |
| Every client money display is the shared Villa formatter (L13) | PASS | §2.5 grep: zero money symbols |
| Playwright: whole flow at 1440x900 and 390x844 + screenshots | PASS (both) | `owner-journey.spec.ts`, 11 screenshots per project |
| Cross-device: two contexts see the same program state | PASS | `programState()` equality (`step`/`programXp`/`stepStars`) + `cross-device-second-context.png` |
| Server `tsc` / vitest; client `vue-tsc` at baseline | PASS | §2.1-§2.3 |

---

## 4. Real vs mocked (explicit)

**Real.** Everything below ran against the live stack: migrated Postgres
(`fspro_p2c_seed2`), the Go world-service, the Node API and the Vite client.

- Registration, world placement and founding were real HTTP calls (§2.6).
- `GET /program/:clubId` and the new `POST /program/:clubId/tip` are the real
  Node route calling the real Go tip engine.
- The program is genuinely server-side: the cross-device check reads the same
  club id from two browser contexts.
- `GAME_TIME_SCALE=50` and `RATE_LIMIT=off` were set **only** to make the
  wall-clock waits (300s cooldowns, 20-40min builds) and repeated test
  registrations practical; no game rule changes.

**Mocked / not run.** Nothing in the journey is route-mocked. The realtime
gateway (`localhost:3005`) was not running; its WebSocket fails and the client
degrades silently, which does not affect the flow.

---

## 5. Known gaps / hand-off

- **3B star overlay in the real flow.** `use-owner-program.doSignManager` sets
  `state` from the `signManager` response, which the server has already
  advanced; the following `advance()` therefore sees no step change and the
  client-side `.op-reveal-card` star overlay does not show in the live flow
  (3B's route-mock spec showed it because its mock kept `step: 'manager'`). The
  step and stars are correct server-side. Per the brief I did not rewrite 3B's
  composable; the e2e treats the overlay as optional. Hand-off to Batch 4 QA.
- **`tip.play.gate` / `tip.idle.break`** are wired (gate ledger, session
  minutes) but only surface when those conditions occur; they are not asserted
  in the e2e.
- **`--muted` AA sweep** remains Batch 4's (DECISIONS B1-2).

---

## 6. Reproduce

```
# Postgres (already up): fs-pro-db-1, host port 5434, db fspro_p2c_seed2
# Go world-service (Windows Go 1.24):
cd services/world-service
set DATABASE_URL=postgresql://fspro:superpassword@localhost:5434/fspro_p2c_seed2&& set WORLD_SERVICE_PORT=3016&& go run ./cmd/world-service

# Node API:
set NODE_ENV=dev&& set USE_POSTGRESQL=true&& set DATABASE_URL=.../fspro_p2c_seed2&& set PORT=3010&& set WORLD_SERVICE_URL=http://localhost:3016&& set GAME_TIME_SCALE=50&& set RATE_LIMIT=off&& npm run start-dev --workspace fs-pro-server

# Client:
set VITE_APP_API_BASE_URL=http://localhost:3010&& npm run dev --workspace fs-pro-client

# Test (Windows Node):
set E2E_BASE_URL=http://localhost:8080&& set E2E_API_URL=http://localhost:3010&& npx playwright test specs/owner-journey.spec.ts
```
