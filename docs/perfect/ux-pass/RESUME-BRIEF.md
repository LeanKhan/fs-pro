# RESUME-BRIEF.md — Pass 1 resumed (2026-10-08T23:08Z)

You are a **playtester** in the FS-Pro UI/UX pass (Pass 1). The instance was
blocked for ~11 h by a WSL↔Windows interop outage plus a wedged API; **it is
fixed** (see `INSTANCE-LOG.md` §7/§8). You are resuming/starting your persona's
play session. Work in `C:\done\fs-pro` (WSL `/mnt/c/done/fs-pro`), branch
`ux/integration`.

## Read these first (your brief)
- `docs/perfect/ux-pass/FOR-AGENTS.md` — rules **U1–U8**, defaults **D1–D7**,
  persona table §3, report format §4, Pass 1 §5.
- `docs/perfect/ux-pass/INSTANCE-LOG.md` — the instance, URLs, credentials.
- `tests/e2e/playtest/README.md` — the harness API.
- Your own `docs/perfect/ux-pass/playtest/<ID>/` files (if you have any).

## Hard rules (do not break)
- **U2** — drive **only the game's UI** in a real browser. Decide every step
  from what you **see** (screenshot + accessibility snapshot). Do **not** read
  game source/specs/docs for hints; no API calls, no DB queries, no URL hacking
  beyond links the UI shows. A missing affordance is a **finding**, not a reason
  to look it up.
- **U4** — no repo code changes. You may write throwaway step scripts and your
  own report files only.
- **U5** — every issue needs a screenshot (or trace) + viewport + route + exact
  steps.
- **U8** — report, don't fix.
- Do **not** start/restart services. If a service is down, log it and stop; that
  is the lead's job (D8).

## Instance
- Client (production build): **http://localhost:4173**
- API: **http://localhost:3010**
- Admin login (A01 only): `playtestadmin` / `Playtest-Admin-2026!`
- New players: register through the UI (**New manager** → founding flow). Record
  the username/password you chose in your `SUMMARY.md`.
- Clock: `GAME_TIME_SCALE=4`, `DayLengthMinutes=48` (D3). Report pacing as it
  would feel at **scale 1** as well as the observed scale-4 number.

## How to drive the browser
Write one small throwaway step script per step (put them in
`docs/perfect/ux-pass/playtest/<ID>/steps/`) and run it through **Windows Node**
from the repo root:

```sh
cmd.exe /c "node docs\perfect\ux-pass\playtest\<ID>\steps\<name>.mjs"
```

Import the harness by absolute file URL so the path works from anywhere:

```js
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const s = await personaContext('<ID>');   // P06..P10 or A01
await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
console.log(await s.ariaSnapshot());      // what a person can perceive
await s.shot('01-landing');               // -> <ID>/screenshots/01-landing.png
await s.decide('one timestamped line');   // -> <ID>/DIARY.md
await s.close();                          // saves login to <ID>/state.json
```

Login persists in `<ID>/state.json`, so the next step script stays signed in.
To **view** a screenshot, read
`/mnt/c/done/fs-pro/docs/perfect/ux-pass/playtest/<ID>/screenshots/<name>.png`
(the `read` tool renders PNGs). Traces are written to `<ID>/traces/*.zip`.

## Output
- `DIARY.md` — timestamped; what you tried, expected, where you hesitated, mood
  **1–5**; real sessions of 10–25 min with breaks (D4), not one marathon.
- `ISSUES.md` — one row per issue, written **as it happens**:
  `ID | severity | category | screen/route | viewport | steps | expected | actual | screenshot | first seen (Level + wall time)`.
  Severity: S1 blocker, S2 major, S3 minor, S4 polish. Category: flow, copy,
  visual, layout/responsive, accessibility, feedback/juice, performance,
  functional bug, admin.
- `SUMMARY.md` at the end (format §4).

## Stop rule (D5)
Play until you reach **Level 2 (400 XP)**, or the **8 h wall-clock cap** from
first registration. If truly blocked (S1), log it, keep exploring everything
else you can reach, and stop at the cap.

When done, reply with: status; persona; Level and XP reached; wall time; new
issues (counts by severity); evidence paths.
