# Product Context — Football Simulation Pro (FS-Pro)

## Purpose & Vision
FS-Pro is a high-performance football management and simulation game. It models football as an authentic dynamic system of spatial tactics, player attributes, fatigue, match ratings, and deterministic simulations. Players take the role of a club director/manager: developing their club campus, training squads, setting pitch grids, managing finances and squad fitness, and competing in ranked league fixtures, cup runs, and association derbies.

## Target Audience & User
- Primary user: Football management strategy players and tactical simulation fans.
- Job to be done: Build a competitive football club from the grassroots up, shape its tactical philosophy, develop facilities and youth, and compete in async fixtures and derbies.

## Platform & Technical Environment
- **Platform**: Web (modern desktop and responsive tablet/mobile).
- **Frontend Stack**: Vue 3 (Composition API), Vite, TypeScript, Three.js (for the 3D campus & matchzone visualizer), `@repo/api-contract` for typed RPC/REST schemas.
- **Backend Stack**: Go HTTP API microservices (`apps/fs-pro-server-go`), Postgres (`pgx`), Redis/Realtime WebSockets.
- **Simulation**: Deterministic match engine with seeded pseudo-randomness, replay verification, spatial pitch grids.

## Core Workflows & Loops
1. **Campus Development**: Construct and upgrade stadium grounds, stands, training complex, youth academy, scouting office, medical centre, and clubhouse headquarters using Project Crews.
2. **Matchday & Tactics**: Configure 4-band pitch grid (Keeper, Def, Mid, Att), assign tactical instructions and manager orders, manage stamina and squad rotation.
3. **Fixtures & Competition**: Play asynchronous ranked fixtures, qualify for leagues, participate in Association Derbies and Pre-Season Tours.
4. **Club Economy**: Passive matchday gate receipts (turnstiles), club shop merchandise, prize dividends, and multi-currency budgeting (Cash, Fans, Scout Tokens, Sponsor Credits).

## Art Direction & Brand Commitments
- **Aesthetic Direction**: Cozy, flat-shaded, sunny, cream/wood UI.
- **Palette**: Warm creams (`#fcf7ee`, `#fffaf0`), biscuit/wood borders (`#e2cc9c`, `#8a5a3b`, `#3e2723`), lawn greens (`#5cc23a`, `#2f8a1c`), warm golds (`#f5b82e`).
- **Typography**: Fredoka for display and headings, clear high-legibility sans for tabular stats.
- **Forbidden Drift**: No dark/cyberpunk or gritty military themes; no photo-realistic uncanny 3D; strictly avoid mobile-war/fantasy terminology.
