# Go Server Rewrite: Architecture, Stack & Coding Standards

This document establishes the technical decisions, library selections, project organization, and coding standards for the Go server backend.

---

## 1. Go Technology Stack

| Concern | Selected Library | Rationale |
| :--- | :--- | :--- |
| **Language Version** | **Go 1.22+** | Routing enhancements (`net/http` path parameters), standard `log/slog`, loop variable semantics. |
| **HTTP Router** | **`go-chi/chi/v5`** | 100% `net/http` compatible, idiomatic, zero-allocation, lightweight middleware chaining. |
| **Database Driver** | **`jackc/pgx/v5`** | High-performance native PostgreSQL driver with connection pooling (`pgxpool`), binary protocol support. |
| **SQL Data Access** | **`sqlc`** | Generates type-safe Go structs and queries directly from raw SQL schema/queries. Zero ORM reflection overhead. |
| **WebSockets** | **`nhooyr.io/websocket`** or **`gorilla/websocket`** | Low-overhead WebSocket frame streaming, context-aware cancellation. |
| **Structured Logging** | **`log/slog`** | Built-in standard library structured logger (JSON output for production, text for local development). |
| **Configuration** | **`caarlos0/env/v10`** | Clean struct-based environment variable loading with defaults and type parsing. |
| **Testing** | **Standard `testing` + `testify`** | Native testing suite with `testify/assert` and `testify/require` for readable assertions. |

---

## 2. Directory Layout (Standard Go Project Layout)

The Go backend will reside in a consolidated, clean module layout under `services/server` (or expanded within `services/`):

```text
services/server/
 ├── cmd/
 │    ├── api/                 # REST API server binary entrypoint
 │    │    └── main.go
 │    └── worker/              # Background world tick daemon entrypoint
 │         └── main.go
 ├── internal/
 │    ├── config/              # Environment variable loading
 │    ├── database/            # pgxpool setup and health checking
 │    ├── domain/              # Pure domain models and interfaces
 │    │    ├── match/
 │    │    ├── fixture/
 │    │    ├── club/
 │    │    ├── player/
 │    │    ├── competition/
 │    │    └── campus/
 │    ├── repository/          # sqlc generated queries & custom queries
 │    │    ├── sqlc/           # Auto-generated Go code from sqlc
 │    │    └── queries/        # SQL query files (.sql)
 │    ├── service/             # Business logic orchestration
 │    │    ├── simulation/     # Orchestrating sim-core DLL execution
 │    │    ├── world/          # World clock & AI calendar tick
 │    │    ├── facility/       # Construction timers & campus logic
 │    │    └── market/         # Transfer bidding & valuations
 │    ├── handler/             # HTTP handlers (chi controllers)
 │    │    ├── game/
 │    │    ├── fixture/
 │    │    ├── replay/
 │    │    └── auth/
 │    ├── realtime/            # WebSocket broadcaster & frame interpolation
 │    └── middleware/          # Auth, CORS, rate limits, request logging
 ├── sqlc.yaml                 # sqlc configuration
 ├── go.mod
 └── go.sum
```

---

## 3. Database Data Access Pattern (`sqlc` + `pgx`)

To maintain the same productivity and safety that Drizzle ORM provided in TypeScript, we avoid manual `rows.Scan()` and avoid heavyweight ORMs (like GORM).

### Workflow:
1. Schema files are exported from PostgreSQL or Drizzle migrations into `internal/repository/schema.sql`.
2. Clean queries are defined in `.sql` files:

```sql
-- name: GetFixtureForPlay :one
SELECT 
    f._id, f."Home", f."Away", f."HomeTeamId", f."AwayTeamId", f."Played", f."Title",
    h."Name" AS home_name, h."ClubCode" AS home_code,
    a."Name" AS away_name, a."ClubCode" AS away_code
FROM "Fixtures" f
JOIN "Clubs" h ON f."HomeTeamId" = h._id
JOIN "Clubs" a ON f."AwayTeamId" = a._id
WHERE f._id = $1 LIMIT 1;
```

3. Run `sqlc generate` $\rightarrow$ produces type-safe Go methods:
```go
fixture, err := queries.GetFixtureForPlay(ctx, fixtureID)
```

---

## 4. API Contract & JSON Schema Alignment

To ensure the Vue 3 frontend (`apps/fs-pro-client`) continues functioning without code modifications:
- Go handler request and response structs must serialize to the **exact JSON property names** expected by the client and specified in `packages/api-contract`.
- Example for match frame types:

```go
type MatchFrame struct {
    Tick    uint16             `json:"tick"`
    Minute  uint8              `json:"minute"`
    Half    uint8              `json:"half"`
    Ball    Vec2               `json:"ball"`
    Players []MatchFramePlayer `json:"players"`
    Events  []MatchEvent       `json:"events"`
}

type MatchFramePlayer struct {
    ID          string  `json:"id"`
    Side        string  `json:"side"` // "home" | "away"
    Num         string  `json:"num"`
    Pos         string  `json:"pos"`
    X           float32 `json:"x"`
    Y           float32 `json:"y"`
    WithBall    bool    `json:"withBall"`
    MatchStatus string  `json:"matchStatus"`
    YellowCards uint8   `json:"yellowCards"`
    RedCards    uint8   `json:"redCards"`
}
```

---

## 5. Coding Standards & AGENTS.md Conformance

In accordance with [`AGENTS.md`](file:///c:/done/fs-pro/AGENTS.md):

1. **Context & Timeouts**:
   - Every external call (HTTP, database query, lock acquisition) must accept `context.Context` and enforce explicit timeouts.
   - Example: `ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)`.
2. **Deterministic Seed Preservation**:
   - Matches must always pass explicit random seeds: `seed string`. Never use global unseeded random generators in the match pipeline.
3. **Structured Errors**:
   - Never silence errors. Wrap errors with domain context: `fmt.Errorf("failed to load starting XI for club %s: %w", clubID, err)`.
4. **Zero-Allocation Hot Paths**:
   - In frame interpolation and WebSocket broadcasting loops, pre-allocate slices with `make([]T, 0, capacity)` to eliminate GC heap churn.
5. **Separation of Concerns**:
   - Match simulation logic lives strictly in Rust (`sim-core`).
   - Match orchestration, persistence, and WebSocket distribution lives in Go.
   - Presentation lives in Vue 3.
