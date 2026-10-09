# Go Server Rewrite: Verification, Benchmarking & Rollback Protocols

This document defines the testing strategies, parity verification, performance benchmarks, and rollback safeguards to ensure zero downtime during the migration.

---

## 1. Parity & Contract Verification Strategy

To guarantee that replacing a TypeScript endpoint with Go does not alter behavior or break the frontend:

### A. Dual-Run Shadow Testing (Parity Mode)
Before routing live production traffic to a newly ported Go endpoint:
1. The API Gateway forwards the request to the Node.js server (primary) and asynchronously duplicates the request to the Go server (shadow).
2. A lightweight comparison helper diffs the JSON response body and status codes.
3. Any discrepancies in JSON keys, numerical precision, or nullability are flagged and logged before cutover.

### B. Frame Interpolation Parity Test
For Phase 1 (Match Broadcaster):
- The test loads identical 720-tick raw match frames into both:
  - TypeScript `expandFrames(frames)`
  - Go `ExpandFrames(frames)`
- Asserts that:
  - Output sub-frame count is identical ($3,404$ frames).
  - Sub-frame ball $(x, y)$ coordinates match within a $0.001$ float tolerance.
  - Sub-frame player $(x, y)$ coordinates match within a $0.001$ float tolerance.
  - Events are attached only to the terminal sub-frame of each tick.

### C. Simulation Worker Parity Test
For Phase 2 (Direct Simulation Worker):
- Using a fixed seed (e.g. `"parity_seed_123"`):
  - Run match via TypeScript `simulateMatch(req)` $\rightarrow$ yields score $S_1$, events $E_1$, stats $P_1$.
  - Run match via Go `SimulateAndSaveFixture(req)` $\rightarrow$ yields score $S_2$, events $E_2$, stats $P_2$.
- Asserts that $S_1 == S_2$, $E_1 == E_2$, and all player goals/assists/ratings are 100% identical.

---

## 2. Benchmark & Performance Targets

Before declaring any phase complete, the Go implementation must be benchmarked against Node.js:

| Metric | Current Node.js Baseline | Target Go Metric | Verification Tool |
| :--- | :--- | :--- | :--- |
| **Match Simulation Throughput** | ~35 matches / sec | **> 150 matches / sec** | `services/sim-service/cmd/bench` |
| **API Read Latency (p99)** | ~45 ms | **< 3 ms** | `wrk` / `k6` |
| **WebSocket Memory Footprint** | ~120 MB / 1,000 spectators | **< 15 MB / 1,000 spectators** | `pprof` / OS memory metrics |
| **Match Replay Stream Latency**| Jitter $\pm 18$ ms | **Jitter $< 1$ ms** | Client telemetry |
| **Process Startup Time** | ~4.5 s | **< 0.2 s** | Cold start measurement |

---

## 3. Rollback Protocol (Zero-Risk Safeguards)

Every phase is protected by immediate rollback mechanisms:

### 1. Reverse-Proxy Level Rollback
All routing is managed in the gateway configuration (e.g. `nginx.conf` or Caddy):
```nginx
# To rollback from Go to Node.js:
# Simply change proxy_pass from port 8081 (Go) back to port 3000 (Node.js)
location /api/game/play/ {
    proxy_pass http://127.0.0.1:3000; # Instant Node.js fallback
}
```
Reloading Nginx takes **0 milliseconds of downtime**.

### 2. Environment Feature Flags
The frontend client and backend services utilize feature flags:
- `USE_GO_REPLAY_WS=true/false`: Determines whether the Vue client connects to Socket.IO (Node) or native WebSocket (Go).
- `ROLE=web/worker`: Toggles whether Node.js or Go executes background world daemons and calendar progression.

### 3. Non-Destructive Database Invariant
- **Strict Rule**: No database table deletions or breaking column schema changes occur during Phases 1 through 5.
- Both Go and Node.js read and write to the same DDL tables (`Fixtures`, `Clubs`, `Players`, `MatchReplays`).
- If Go is stopped at any time, Node.js immediately resumes reading and writing to the database without data corruption.
