# OPEN-QUESTIONS.md — phase 2 (credentials/paid items only)

Per R1′, only things no agent can supply: credentials, paid accounts, billing
or legal wording. Everything else is ruled in `DECISIONS.md` and the run
continues.

## OQ-1 — Sentry DSN (carried from phase 1 B5B)

Error tracking is wired (`@sentry/node`, `@sentry/vue`) and DSN-gated. Supply
`SENTRY_DSN` / `VITE_SENTRY_DSN` (and optional `SENTRY_RELEASE`) in the deploy
environment. Until then, tracking is a silent no-op. **Blocks nothing.**

## OQ-2 — advisor portrait generation (if L9(a) is chosen)

`threejs-image-generator` needs a working Gemini key/billing. Memory says they
were blocked on 2026-10-04; the lead checks first. If blocked, the run falls
back to the in-repo layered SVG (L9(b)) and records it in `DECISIONS.md`.
**Blocks nothing.**

## OQ-3 — world seed on the dev DB

L5's world seed runs on scratch DBs in this program. Running it on the dev DB
`fspro` (and the production DB) is a release step the owner performs. **Blocks
nothing** (scratch DBs are used for all tests).
