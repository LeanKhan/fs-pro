# OPEN-QUESTIONS.md — UX pass (credentials/paid/legal only)

## OQ-UX-1 — Windows↔WSL interop outage (BLOCKER, needs the operator)

At ~2026-10-08 12:10Z the WSL→Windows interop socket died: every `cmd.exe`
invocation from WSL returns `UtilAcceptVsock:271: accept4 failed 110`. The
playtester harness runs Playwright through **Windows Node** (`cmd.exe /c`), and
the client preview binds Windows `127.0.0.1:4173` (not reachable from WSL), so
**no agent can drive a browser** while this is down. This is the only thing
blocking Pass 1. It needs the operator to restart the WSL interop / Docker
Desktop (or the machine). Logged in `INSTANCE-LOG.md §7`.

Before the outage the wave-1 playtesters captured **53 issues** (1×S1, 9×S2,
36×S3, 7×S4) and **156 screenshots**; those reports stand.

**Follow-up diagnosis (lead, 12:xxZ):** from WSL, `http://localhost:4173/`
returns **200** (WSL shares Windows loopback), but `:3010`, `:3016` are
**refused** — the `0.0.0.0`-bound services are either **down** or blocked for
the WSL→host route. Restarting them needs interop, so both must be restored by
the operator. A Linux Chromium *is* installed (`~/.cache/ms-playwright`) as a
possible fallback, but it cannot reach the API while the API is unreachable.
P05 logged 16 issues (3×S2, 6×S3, 7×S4).

_Everything else is ruled in `DECISIONS.md`._
