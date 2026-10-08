# DECISIONS.md — UX pass lead rulings

Adopted unchanged: **U1–U8** (rules), **O1–O3** (owner), **D1–D7** (lead
defaults) from `docs/perfect/ux-pass/FOR-AGENTS.md`. Only departures and new
rulings are recorded here.

## Owner ruling (2026-10-08)

- **D8 — start the services freely.** The owner authorises starting (and
  restarting) the Go services (`world-service`, `worldgen`), the Rust `sim`
  service and the rest of the playtest stack **without approval**. The lead may
  start/restart them at will and logs each intervention in `INSTANCE-LOG.md`
  (U3). No agent blocks waiting for permission to bring a service up.

_None else yet — appended as the pass proceeds._
