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

_Everything else is ruled in `DECISIONS.md`._
