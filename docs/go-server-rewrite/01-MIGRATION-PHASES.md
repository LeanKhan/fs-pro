# Go Server Rewrite: Phase-by-Phase Implementation Guide

This document provides deep technical instructions for migrating each subsystem from TypeScript to Go.

---

## Phase 1: Realtime Match Broadcaster & Frame Interpolator

### 1. Current State & Pain Points
- **Files**: `apps/fs-pro-server/src/realtime/matchBroadcaster.ts`, `frameInterpolation.ts`, `packedFrames.ts` (~685 LOC).
- **Behavior**:
  - `expandFrames()` converts 720 raw ticks into 3,404 visual subframes using linear interpolation (`lerp`).
  - Node.js manages Socket.IO rooms (`/match-replay`) and schedules frame emissions using `setTimeout` (60ms intervals).
- **Bottlenecks**:
  - High memory usage per match replay in Node.js heap.
  - V8 event loop jitter caused by hundreds of active timer callbacks under concurrent spectating.
  - GC pauses can stutter frame delivery to client pitch visualizers.

### 2. Target Go Architecture
- **Location**: Integrate into `apps/fs-pro-realtime` or `services/sim-service/realtime`.
- **Implementation**:
  - **Frame Interpolator (`pkg/replay/interpolator.go`)**: Pure Go implementation of `ExpandFrames()` matching `frameInterpolation.ts` mathematics bit-for-bit.
  - **Broadcaster Hub (`pkg/replay/hub.go`)**: Goroutine-backed match rooms.
  - **Timer Loop**: Uses `time.NewTicker(subframeInterval)` per match room with non-blocking channel fan-out to connected spectator WebSocket connections (`gorilla/websocket` or `nhooyr/websocket`).

```go
type PlaybackStep struct {
    Frame   MatchFrame `json:"frame"`
    DelayMs int        `json:"delayMs"`
    Capped  bool       `json:"capped"`
}

func ExpandFrames(raw []MatchFrame) []PlaybackStep {
    // Exact mathematical port of frameInterpolation.ts
}
```

### 3. Step-by-Step Execution
1. Implement `interpolator.go` and `packed_frames.go` in Go.
2. Add unit tests verifying that Go `ExpandFrames()` produces identical coordinates to TypeScript `expandFrames()`.
3. Add WebSocket endpoint `/match-replay/watch?fixtureId={id}` in the Go service.
4. Update `apps/fs-pro-client/src/utils/matchReplaySocket.ts` to connect to Go realtime port.
5. Decommission `src/realtime/matchBroadcaster.ts` in Node.js.

---

## Phase 2: Direct Match Orchestration & DB Simulation Worker

### 1. Current State & Pain Points
- **Files**:
  - `apps/fs-pro-server/src/jobs/matchQueue.ts`
  - `apps/fs-pro-server/src/jobs/buildSimulateMatchRequest.ts`
  - `apps/fs-pro-server/src/controllers/game/game.controller.ts` (`play()` method)
- **Bottlenecks**:
  - Node.js queries Postgres for club squad lineups $\rightarrow$ serializes huge JSON $\rightarrow$ sends HTTP POST to Go `sim-service` on port 5050 $\rightarrow$ Go calls `sim_core.dll` $\rightarrow$ Go serializes response $\rightarrow$ Node.js deserializes $\rightarrow$ Node.js writes results to Postgres.
  - Double HTTP network roundtrip + double JSON encode/decode slows simulation down by 300%.

### 2. Target Go Architecture
- **Location**: `services/sim-service/orchestrator`.
- **Implementation**:
  - Connect `sim-service` directly to PostgreSQL using `jackc/pgx/v5`.
  - Endpoint `POST /api/game/play/:fixtureId`:
    1. Reads fixture, participating clubs, starting XI, and tactics directly from PostgreSQL in a single indexed query.
    2. Calls `sim_core.dll` via CGO / lazy DLL in-memory (0ms network overhead).
    3. Writes `Fixtures`, `MatchReplays` (packed frames), `PlayerMatchDetails`, `ClubMatchDetails`, and updates club stats in a single database transaction.
    4. Triggers Phase 1's Go Broadcaster if spectators are waiting.

### 3. Step-by-Step Execution
1. Add PostgreSQL connection pool to `services/sim-service` via `DATABASE_URL`.
2. Port `buildSimulateMatchRequest.ts` SQL queries to Go (`pgx`).
3. Port `updateFixture()` persistence logic (updating scores, recording replay, writing player details) to Go.
4. Expose `POST /sim/play/:fixtureId` on Go `sim-service`.
5. Point Node.js or reverse proxy directly to Go for fixture playback.

---

## Phase 3: Background World Daemons & Calendar Clock

### 1. Current State & Pain Points
- **Files**:
  - `apps/fs-pro-server/src/services/calendar/calendar-clock.service.ts` (419 LOC)
  - `apps/fs-pro-server/src/services/world/ai-world.service.ts` (213 LOC)
  - `apps/fs-pro-server/src/services/facilities/facilities.service.ts` (sweep timers)
- **Behavior**:
  - Node runs `setInterval` timers for game world clock ticks, campus construction countdowns, and AI club friendlies/transfers.
  - Prone to timer drift, event loop blockage during heavy DB queries, and unhandled rejection crashes.

### 2. Target Go Architecture
- **Location**: Standalone daemon or embedded worker inside Go backend (`cmd/world-worker`).
- **Implementation**:
  - **PostgreSQL Advisory Locks**: Ensures only one worker node executes the world tick if multiple instances run (`pg_try_advisory_lock`).
  - **Go Tickers**:
    - `CalendarClockTicker`: Advances world day when `ClockMode == 'live'`.
    - `FacilitiesSweepTicker`: Decrements building construction timers on `ClubAssets` table.
    - `AiWorldTicker`: Pairs resting AI clubs, runs matches via `sim-core`, and updates transfer market.

### 3. Step-by-Step Execution
1. Implement `world_clock.go`, `facilities_sweep.go`, and `ai_world.go` in Go.
2. Use database transactions for all state transitions.
3. Configure `apps/fs-pro-server` with `ROLE=web` (which disables Node's background timers).
4. Run Go world worker concurrently and verify that world days advance seamlessly.

---

## Phase 4: Read-Heavy Query & Stats APIs

### 1. Current State & Pain Points
- **Files**:
  - `controllers/fixtures/` (Fixtures schedule & details)
  - `controllers/match-replays/` (Historic match replay frames)
  - `controllers/calendar/` (Calendar events & days)
  - `controllers/rankings/` & `seasons/` (League tables, top scorers)
- **Characteristics**:
  - 100% read-only, stateless HTTP queries.
  - Very high query volume from client browsing fixtures, stats, and rewatching matches.

### 2. Target Go Architecture
- **Framework**: `go-chi/chi/v5` (zero allocation, ultra-fast routing).
- **Queries**: Generated with `sqlc` from existing PostgreSQL schema for compile-time verified SQL.
- **Benefits**:
  - Responses streamed directly as JSON with `jsoniter` or standard `json`.
  - Replay queries for packed frames (~200KB JSONB) bypass Node's V8 memory limits entirely.

### 3. Step-by-Step Execution
1. Set up `sqlc` config in `services/api` pointing to `apps/fs-pro-server/src/db/drizzle/schema.ts` (or schema SQL dump).
2. Generate Go queries for `GetFixtureById`, `GetMatchReplay`, `GetStandingsBySeason`, and `GetCalendar`.
3. Implement HTTP handlers in Go matching the `@repo/api-contract` JSON shapes.
4. Route these 4 routes in the Nginx/gateway to Go.

---

## Phase 5: Core Domain Engines

### 1. Target Subsystems
Migrate core business logic packages in order of domain isolation:

1. **Facilities Domain (`services/facilities/`)**:
   - Campus grid rules, asset levels, construction costs, and campus buffs.
2. **Transfer Market Domain (`services/transfers/`)**:
   - Transfer ledger, AI valuation algorithms, bidding wars, wage caps, and contract renewals.
3. **Competition & League Engine (`services/competitions/`)**:
   - Round-robin league generators, knockout bracket trees, stage progression, promotion/relegation calculators.

### 2. Strategy
- Write comprehensive unit tests in Go mirroring existing TypeScript test cases.
- Use Domain-Driven Design (DDD) with clear repository interfaces.

---

## Phase 6: Auth, User Management & Node.js Decommission

### 1. Authentication Port
- Port `controllers/auth/`:
  - Password hashing via `golang.org/x/crypto/bcrypt`.
  - Cookie session parsing compatible with `express-session` format (or modern JWT).
  - Imagination SSO callback handler.

### 2. Complete Cutover
- Point all `/api/*` traffic to the Go server.
- Terminate the Node.js `fs-pro-server` process.
- Remove `apps/fs-pro-server` from `package.json` workspaces.
- Retain `apps/fs-pro-client` (Vue 3 frontend), `crates/sim-core` (Rust engine), and the unified Go backend!
