# The Handle — LLM-as-Manager Interface Layer

## Context

The simulation engine itself (20 milestones, `SIMULATION-IMPLEMENTATION-TRACKER.md`) is now behaviorally rich: tactics, off-ball behavior, roles, score-based decisions, fatigue, memory. But nothing outside a single match can act on any of it autonomously — every club, claimed or not, behaves identically today (a static default tactic, auto-picked lineup, auto-picked substitutions, no transfers or training decisions ever initiated). The user's stated goal is that **the game's success hinges on running autonomously** — an LLM (frontier or a smaller custom/fine-tuned model) needs to be able to act as a club manager, ultimately across whole seasons/leagues with no human involved.

Two design docs already sitting in the repo (`WORLD-INTENT-IDEAS.md`, repo root; `apps/fs-pro-server/src/state/AI-HANDLING.md`) capture prior thinking on this from the user's own earlier design conversations. The load-bearing principles from `AI-HANDLING.md` that this plan follows throughout:

- **Handles are semantic domain actions, not CRUD.** The LLM never sets a database row directly — it calls something like "make this substitution" or (later) "transfer this player," and the subsystem enforces every rule that fact implies.
- **The LLM proposes; the deterministic engine still decides.** For anything genuinely stochastic (a match result), the LLM doesn't set the outcome and doesn't get the simulation re-run until it complies. It proposes a desired DIRECTION ("Sharks should be more aggressive/dominant this match," "Turbo should play it safe") which a translation layer converts into bounded INPUT-side adjustments — tactic-style nudges and/or a scoped `SimulationConfig` override (Milestone 19's `mergeSimulationConfig`, already proven to move real match output per `tacticSensitivityCheck.ts`) — applied BEFORE the match, which then runs exactly once, genuinely nondeterministically, tilted but not forced. Same "semantic scale, not LLM-chosen numbers" principle `WORLD-INTENT-IDEAS.md` describes (`tiny/small/moderate/large/extreme`, translated by game systems into actual values, never the LLM picking `+0.08` directly).
- **Never silently overwrite a simulation result, and never resample/reject-and-retry to force one.** A biased-but-honest single run, exactly as `Decider`/the resolvers already work — decision inputs can be shaped, execution/outcome stays genuinely uncertain.

Code research this session confirmed the match-level machinery for this already exists and was explicitly built for it: `simulation/transitions/index.ts`'s six validated functions (`TransitionResult<T>`, `applyTacticalChange`, `applySubstitution`, etc.) carry a doc comment saying outright they're "infrastructure for a future human/AI manager decision surface (Milestone 7/21, not yet built)." `Game.changeTactic()` has an identical comment. Milestone 21 in the simulation tracker ("Manager And AI Decisions") is the next unstarted milestone and describes exactly this gap. Everything above the match (season/league/transfers/training) has zero equivalent infrastructure — it's static defaults and manual-only endpoints.

Given the complexity spread, this plan is split into three tiers. **Milestone 21 is folded into the short-term tier** as its concrete first slice — the plan below builds it as a real, general "handle" (following the semantic-action principle from day one) rather than a narrow one-off, so nothing needs reshaping when later tiers extend it.

---

## Short-term: Milestone 21 as the first real handle (halftime tactics + substitutions)

**Scope:** one club-facing decision point (halftime), backed by the already-built transition system, exposed through a new semantic handle API, with a genuine pause/resume through the match-simulation worker (not a bypass — chosen explicitly to keep every fixture, AI-controlled or not, on the same isolated execution path), plus a working reference orchestrator that actually calls an LLM end-to-end. In-memory decision state (no new persistence layer yet — acceptable for a first slice; matches fall through to today's fully-automatic behavior if a response never arrives).

### 1. Credential/scoping — new, minimal

No API-key mechanism exists anywhere in this codebase (`middleware/user.ts`'s `checkSession` is dead code; auth is otherwise cookie-session-only). Add a narrowly-scoped one, not a general app-wide auth system:

- New Drizzle table `HandleCredentials` (`apps/fs-pro-server/src/db/drizzle/schema.ts`): `id`, `Token` (unique, opaque bearer token), `ClubId` (FK → `clubs.id`), `Label` (operator note, e.g. `"claude-manager-v1"`), `Active`, timestamps. One credential = one club (matches `clubs.UserId`'s existing one-nullable-FK shape). Reject issuing a credential for a club that already has a non-null `UserId`, and vice versa — a club is human-claimed, AI-handled, or neither, never both.
- New `apps/fs-pro-server/src/middleware/handleAuth.ts`: resolves `Authorization: Bearer <token>` → `ClubId`, 401s otherwise, attaches `req.handleClubId`.
- Issuance: one admin-gated endpoint (reuse the existing `isAdmin` flag on `users`) that creates a row and returns the token once. No UI, no CLI — out of scope for this slice.

### 2. The handle contract (ts-rest + zod, following existing conventions exactly)

New files, following the `routes/<resource>.ts` + `schemas/<resource>.ts` + `<resource>.router.ts` + `<resource>.service.ts` pattern every other resource in this codebase uses:

- `packages/api-contract/src/schemas/handle.ts` — `PendingDecisionSchema` (discriminated union on `type`, only `'half-time'` for now, shaped for easy extension later), `HalfTimeDecisionSchema` (`tactic: TacticSchema.optional()` — reuses the existing `TacticSchema` from `schemas/game.ts` rather than redefining it — plus `substitutions: z.array({outgoingPlayerId, incomingPlayerId}).optional()`).
- `packages/api-contract/src/routes/handle.ts` — `GET /handle/pending-decision`, `POST /handle/decisions/:decisionId`. Responses wrapped in the existing `successEnvelope`/`failEnvelope`, mirroring `TransitionResult`'s own success/failure shape.
- `apps/fs-pro-server/src/controllers/handle/handle.router.ts` — thin ts-rest binding, gated by `handleAuth`.
- `apps/fs-pro-server/src/controllers/handle/handle.service.ts` — the actual logic: an in-memory map of `decisionId → {clubId, observation, actionMenu, respond}` populated when a worker signals a pending decision (see §3), resolved by `submitDecision`, with a timeout that resolves to "no decision" automatically so a slow/dead LLM never stalls a match.
- Register in `packages/api-contract/src/index.ts` and `apps/fs-pro-server/src/routers/index.ts`, same as every other resource.

`GET pending-decision` returns a bounded observation (score, match stats from `Match.Details.Home/AwayTeamDetails`, current tactic, on-pitch/bench squad with `Condition` from Milestone 20) plus a closed-vocabulary `actionMenu` (exact formation/style enums from `tactic-options`, `maxAllowed` substitutions, GK already excluded from eligible lists). This shape is deliberately usable by both a frontier model (reads the same JSON freely) and a small/constrained model (only ever fills a narrow, enumerated `POST` body — no free text, no tool-calling required).

### 3. The worker pause/resume protocol (the real technical core of this slice)

Confirmed directly this session: `matchSimWorker.ts` currently takes `workerData` in and sends exactly one `postMessage` at the end; `matchQueue.ts`'s `runInWorker()` treats the first message as final and immediately terminates the worker. Both need to support a mid-match round trip:

- **`matchQueue.ts` → worker (in):** before spawning, if either club in the fixture has an active `HandleCredentials` row (one DB lookup, main-thread side — the worker itself stays DB-free per its existing design), pass `aiControl: {home?: boolean, away?: boolean}` into `workerData`.
- **Worker → main thread (mid-match):** `Game.advanceMatch()`'s existing half-time branch (`Game.ts`, right after `this.swapClubFormations()`, before `this.performHalfTimeSubstitutions()` — confirmed exact insertion point this session) gains a new `await this.resolveHalfTimeDecisions()` call. For each AI-controlled side: build the observation/action-menu payload, `parentPort.postMessage({type:'pending-decision', decisionId, side, observation, actionMenu})`, then await a matching `{type:'decision-response', decisionId}` message raced against a timeout (`HANDLE_DECISION_TIMEOUT_MS`, new env var, e.g. 15s default). No credential on either side → the hook no-ops immediately, zero behavior/latency change for ordinary matches.
- **Applying the decision:** if a tactic was supplied, call `this.changeTactic(side, tactic)` — already public, already validated by `applyTacticalChange`, and confirmed safe to call at this exact point (after `swapClubFormations()`, while `StartingSquad.length` is still exactly 11 — `changeTactic()`'s own doc comment is explicit that this breaks once substitutions grow the array). If substitutions were supplied (even an empty list = explicit "no subs"), apply each via `applySubstitution` directly and skip that side's call into `performHalfTimeSubstitutions()`. No credential or no response in time → falls through to today's unmodified automatic path (auto tactic-swap already ran; auto-subs run exactly as today).
- **Main thread relay:** `matchQueue.ts`'s `worker.on('message', ...)` handler now branches on `msg.type`: `'pending-decision'` → register it with `handle.service.ts` (passing a `respond` closure that does `worker.postMessage({type:'decision-response', decisionId, decision})`), do **not** terminate the worker, keep listening; `'result'` (today's implicit final shape, given an explicit `type` for clarity) → resolve/terminate exactly as today.
- **Timeout budget:** the outer per-job `MATCH_TIMEOUT_MS` must not race against the LLM decision wait. `runInWorker()` gains an effective-timeout override for AI-controlled fixtures (`MATCH_TIMEOUT_MS + expectedDecisionPoints * HANDLE_DECISION_TIMEOUT_MS`), computed once in `matchQueue.ts` before spawning, rather than pausing/resuming the existing timer.

Everything above is additive to `matchQueue.ts`/`matchSimWorker.ts`/`Game.ts` — no existing message shape, transition function, or auto-planner logic is modified, only extended with a new branch each is free to ignore when no credential is present.

### 4. Reference orchestrator (proves the whole pipe end-to-end)

A small standalone script, `apps/fs-pro-server/src/scripts/handleOrchestrator.ts` (matches the existing `src/scripts/` convention for runnable utilities), NOT embedded in the game server's own runtime — it's just another HTTP client of the handle API, same as the future "run a whole season" orchestrator will be:

- Polls `GET /api/handle/pending-decision` (bearer token from an env var) on an interval.
- On a pending decision, calls a pluggable "model caller" function and submits the result via `POST /api/handle/decisions/:id`.
- The model caller talks to a configurable HTTP endpoint (`LLM_API_URL`/`LLM_API_KEY`/`LLM_MODEL` env vars) rather than a hardcoded provider SDK — this is what makes it work for "custom or generic" models per the user's requirement: swapping providers (or pointing at a self-hosted custom model) is an env-var change, not a code change. Default shape targets the Anthropic Messages API (closest at hand), structured so the adapter function is the only provider-specific piece.
- No new dependency required — plain `fetch`/`axios` (already a dependency), consistent with `services/worldgen/client.ts`'s existing "thin client, one env var, no SDK" precedent in this codebase.

### Verification

- `tsc --noEmit` / `oxlint` clean, same as every simulation-tracker milestone.
- A dedicated script (same throwaway-verification pattern used throughout the simulation tracker): issue a test `HandleCredentials` row for one club in a real roster-pool fixture, kick it off through the real `play()` flow, confirm `GET pending-decision` returns a well-formed observation at halftime, submit a tactic change + a substitution via `POST`, confirm the match's second-half tactic/lineup actually reflects it (read back off the resolved `Match`), and confirm a fixture with **no** credential behaves byte-identical to today (`simRealismCheck.ts --compare` against a pre-change baseline — zero behavior change for non-AI-controlled matches is the load-bearing invariant here).
- Confirm the timeout path: a credentialed club whose orchestrator never responds still finishes the match via the automatic fallback, within the extended timeout budget.
- Run the reference orchestrator against a real fixture with a real LLM call configured, end-to-end, at least once — this is the actual proof of the stated goal ("run autonomously"), not just plumbing.
- Real HTTP smoke test against the running dev server, matching the pattern used for every simulation milestone.

---

## Medium-term (sketch — not detailed further here)

Builds on the short-term slice's credential/contract/worker-protocol scaffolding rather than duplicating it:

- **Pre-kickoff tactic selection.** Smaller than the half-time slice architecturally (no mid-match pause needed — `resolveManagerTactic()` already runs on the main thread before a worker is even spawned).
- **Squad/lineup selection.** No validated transition exists yet (`selectMatchdaySquad` is a hardcoded best-XI auto-picker) — needs a new transition function analogous to `applyTacticalChange`, plus a new pre-match decision point.
- **Training focus.** Currently a once-a-year, no-dedicated-endpoint setting buried inside `endSeasonCycle` — needs its own decision cadence, decoupled from that fixed pipeline.
- **Transfers.** Largest of this tier: today there's exactly one instant-buy endpoint with no negotiation/consent/CPU-initiated-offer machinery at all — a genuine new subsystem (offer/counter/accept/reject), not a decision-point wired to something that already exists.
- **Directional-bias outcome requests** (`football.playMatch({fixtureId, directive: {target: 'sharks-fc', direction: 'more-aggressive'|'more-dominant'|'conservative'|..., magnitude: 'small'|'moderate'|'large'}})`) for whole-fixture outcome shaping — the PROPOSE → PLAN → VALIDATE → SIMULATE → VERIFY → COMMIT transaction shape still applies (validate the directive is legal, translate it into a concrete, bounded `mergeSimulationConfig`/tactic-style override scoped to that one match, run the real simulator exactly once with that bias, commit the resulting coherent trajectory). No resampling, no rejecting-and-retrying a run that didn't comply — the whole point is an honest, single, biased-but-real simulation. This generalizes the short-term slice's "semantic handle" pattern to outcome-shaping without ever forcing an outcome.
- **Multi-club credentials / a day-and-season advancement orchestrator** — something that polls "which credentialed clubs have a pending decision or an unplayed fixture" and drives `play()`/day-advance on its own, so a league can progress without a human clicking anything. Deliberately I/O-bound (HTTP calls out to this server + an LLM), not a `worker_threads` job like match simulation — a plain async loop or external scheduler, not a reuse of `matchQueue.ts`'s pattern.

## Long-term (sketch)

The full `WORLD-INTENT-IDEAS.md` vision: a World Reasoner interpreting cross-system events (football, economy, civic/political) into qualitative, semantically-scaled influences (`tiny/small/moderate/large/extreme`, never LLM-authored raw numbers) that a deterministic Influence Resolver translates into actual subsystem modifiers with decay/persistence and applicability thresholds; football becomes one subsystem among several communicating only through published World Events, not direct imports. Distinct per-club "Club Owner Agent" actors (potentially separate LLM instances) making genuinely autonomous decisions across an entire unattended league, with the short/medium-term handle work above as their actuation layer.

---

## Open items carried forward (decided for short-term, revisit later if needed)

- Decision persistence is in-memory for this slice (simplest, matches `matchQueue.ts`'s own precedent) — move to a DB-backed table if the orchestrator needs to run remotely/intermittently or matches need to survive a server restart mid-pause.
- Credential issuance is a bare admin endpoint for now — no management UI.
- One credential per club; "one LLM instance manages several clubs" is an orchestrator-side concern (loop over several tokens), not a server-side one.
