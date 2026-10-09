# OPEN-QUESTIONS.md — UX pass (credentials/paid/legal only)

## OQ-UX-1 — Windows↔WSL interop outage (RESOLVED 2026-10-08T23:08Z)

At ~12:10Z the WSL→Windows interop socket died (`UtilAcceptVsock:271: accept4
failed 110`) and from ~13:20Z the API's DB-backed routes hung. **Both are now
resolved:** interop works again (Docker Desktop was restarted by the operator,
which also refreshed the Postgres container), and the lead restarted the API
web+worker under D8 (INSTANCE-LOG §7). Full verification: `/healthz`
`200 {"ok":true}` on 3010/3011, real admin login `200`, worker reconnected to
Postgres, clock live, Playwright reachable. **No answer needed.**

Before the outage the wave-1 playtesters captured **53 issues** (1×S1, 9×S2,
36×S3, 7×S4) and **156 screenshots**; those reports stand.

**Resolved diagnosis:** the outage was WSL→Windows interop (operator/Docker
Desktop restart) plus a dead API DB pool (containers were restarted under the
API's live connections). The lead restarted API web+worker under D8 and verified
the stack end-to-end; see INSTANCE-LOG §7 last row.
P05 logged 16 issues (3×S2, 6×S3, 7×S4).

_Everything else is ruled in `DECISIONS.md`._

## OQ-UX-2 — WSL↔Windows interop outage #2 (BLOCKER, needs the operator)

From ~2026-10-09 02:40Z the interop failure **recurred**: every `cmd.exe` call
from WSL returns `UtilAcceptVsock:271: accept4 failed 110`, and all interop
sockets (`/run/WSL/*_interop`) refuse — so the Windows-Node Playwright harness
cannot run and **Pass 1 is paused**. The Windows-side interop server is dead and
cannot be revived from inside WSL; it needs a host action (`wsl --shutdown`, then
start Docker Desktop / the machine). No credentials or content are needed — just
the restart. Logged in `INSTANCE-LOG.md` §7/§8.
