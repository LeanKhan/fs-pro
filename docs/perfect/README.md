# docs/perfect — "perfect the game" orchestration run

This directory is the control room for the multi-batch program described in
`FOR-AGENTS.md` (repo root). The LEAD agent owns it; sub-agents write their
reports here and nowhere else in `docs/`.

Files:

- `PROGRESS.md` — running table of batch / agents / branches / status / evidence.
- `BASELINE.md` — Batch 0 (baseline + audit). Facts with file:line evidence.
- `OPEN-QUESTIONS.md` — everything blocked on the owner. Updated before any
  batch is considered done.
- `VERIFY-B<N>.md` — one per batch, written by a verifier who did not build it.
- `WORLD-HIERARCHY-SPEC.md` — Batch 1A deliverable (owner gate before Batch 2).

Rules of record: `FOR-AGENTS.md` R1–R11. No item is "done" without command
output or a screenshot. No claim without a file:line or a command+output.
