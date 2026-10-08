# DECISIONS.md — phase 2 lead rulings

The owner does not answer questions this run (FOR-AGENTS §1). Every call the
lead makes in the owner's place is recorded here: the question, the options,
the choice, the reason. The owner's brief is `INSTRUCTIONS.md`; the program is
`FOR-AGENTS.md`.

## 0. Adopted unchanged from the owner brief (P1–P7)

| P | Ruling |
| --- | --- |
| P1 | The human is a **club owner**, not a manager. |
| P2 | New-club program order: sign a **manager** → sign **players** → build **facilities** → reach **Level 1** → the game assigns a league. |
| P3 | Every step is gamified; the game is hard and strategic. |
| P4 | A "Farm City"-type **advisor** guides the player; animated popup, prominent on the campus. |
| P5 | The world starts with the six existing cultures/countries (`docs/cultures/STARTER.md`); worldgen is extended to person/club/place/stadium names. |
| P6 | Currency is the **Villa (V)**. |
| P7 | Startup: existing clubs + ~**5,000 free-agent players** + **1,000 managers**, random skill/age; each new club draws a random **V1M–V5M** starting balance. |

## 1. Adopted unchanged from the program's lead defaults (L1–L13)

L1–L13 in `FOR-AGENTS.md` §2 are adopted as written. Highlights the build
agents must follow:

- **L1** founding: random V1M–V5M balance, no owner-manager row, no squad, no
  pyramid entry at founding.
- **L2** the pyramid trigger moves to reaching **Level 1** (idempotent).
- **L3** existing clubs are unchanged; backfill marks their program complete.
- **L4** managers are real hires (attributes, wage, fee, contract); owner sets
  a *brief*, the manager executes it.
- **L5** shared, seeded, idempotent market (5,000/1,000); conditional-update
  signing (no double-sign); PLAY gated on a legal squad.
- **L6** Level 0→1 must be earned: program XP scaled by 1–3 stars + qualifying
  friendlies.
- **L7** no dead ends; **skill beats luck**.
- **L8** program state is server-side per club (replaces localStorage steps).
- **L9** one cozy advisor character; portrait per L9(a→c); deterministic,
  rule-based advice (no LLM).
- **L10** advisor docks bottom-left, idle bob/blink, typewriter, points at
  buildings, never covers PLAY/dock/HUD, respects reduced motion, works at
  390×844.
- **L11** git: `p2/integration` from `perfect/integration` @ `1cfd57a`
  (phase-1 tip); sub-agent branches `p2/b<N>-<agent>`; control room
  `docs/perfect/phase-2/`.
- **L12** cultures are data: worldgen is the one name source; re-key banks by
  culture; six starting cultures with per-country mixes; ≥400 first names and
  ≥400 surnames each; deny-list + collision tests.
- **L13** Villa is a display unit only (1 stored unit = V1); one shared
  formatter; a money-symbol grep must return zero.

## 2. Lead decisions taken (specs may override with a recorded reason)

| # | Question | Options | Choice | Why |
| --- | --- | --- | --- | --- |
| D1 | How do Batch 0 agents work given worktrees lack `node_modules`? | (a) full `npm ci` per worktree; (b) run read-only baseline checks in the main checkout and commit docs on a branch | **(b)** | Batch 0 is docs/read-only; avoids a 900-package install per agent and the WSL-symlink/esbuild breakage seen in phase 1. |
| D2 | Currency format | `V1,500,000` vs `V1.5M` vs `1.5M V` | **`V1.5M` / `V1,500,000` (the phase-1 `money()` style, prefixed with V)** | Matches the existing stat formatting the client already uses; one formatter (`Villa`), no symbol drift. |
| D3 | Advisor portrait source | (a) threejs-image-generator (Gemini); (b) in-repo layered SVG; (c) worldgen face service | **Try (a); fall back to (b)** | L9 order; (a) may be blocked on billing (check first); (b) is deterministic and animatable. |

_More rows are appended as the run proceeds._
