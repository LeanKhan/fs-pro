# FS-PRO Go Server Rewrite Documentation

This directory contains the complete technical architecture and step-by-step migration blueprint for rewriting the **TypeScript backend server** (`apps/fs-pro-server`) into **Go**, utilizing the **Strangler Fig Pattern**.

## Documentation Index

1. [**`MASTER-PLAN.md`**](./MASTER-PLAN.md)
   - High-level executive overview, target architecture diagram, subsystem inventory (~40k LOC), and overarching roadmap.
2. [**`01-MIGRATION-PHASES.md`**](./01-MIGRATION-PHASES.md)
   - In-depth technical breakdown of all 6 phases:
     - Phase 1: Realtime Match Broadcaster & Frame Interpolator
     - Phase 2: Direct Match Orchestration & Simulation Worker
     - Phase 3: Autonomous World Daemons & Calendar Clock
     - Phase 4: High-Throughput Read APIs
     - Phase 5: Core Domain Engines (Facilities, Transfers, Competitions)
     - Phase 6: Auth, User Management & Complete Node Deprecation
3. [**`02-ARCHITECTURE-AND-STANDARDS.md`**](./02-ARCHITECTURE-AND-STANDARDS.md)
   - Recommended Go stack (`chi`, `jackc/pgx/v5`, `sqlc`, `slog`).
   - Project directory layout and design patterns.
   - API contract compatibility with `@repo/api-contract`.
   - Coding standards aligned with `AGENTS.md`.
4. [**`03-VERIFICATION-AND-ROLLBACK.md`**](./03-VERIFICATION-AND-ROLLBACK.md)
   - Parity verification and dual-run testing procedures.
   - Benchmark throughput and latency targets.
   - Zero-downtime rollback protocols via reverse proxy and database invariants.
