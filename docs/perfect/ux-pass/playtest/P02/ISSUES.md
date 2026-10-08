# P02 — ISSUES.md

Football Manager veteran, 1440×900 mouse. One row per issue, written as it
happens. `ID | severity | category | screen/route | viewport | steps | expected |
actual | screenshot | first seen (game Level + wall time)`.

Severity: **S1** blocker (can't progress / lose progress) · **S2** major (wrong,
confusing or costly mistake likely) · **S3** minor (friction, unclear, ugly) ·
**S4** polish.
Category: flow, copy, visual, layout/responsive, accessibility, feedback/juice,
performance, functional bug, admin.

| ID | Sev | Category | Screen/route | Viewport | Steps | Expected | Actual | Screenshot | First seen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P02-01 | S3 | functional bug | Found your club step 3 "Kick-off" (`/start`) | 1440×900 | Register → New manager → Next: your club → fill → Next: kick-off | The Bank shown on the founding confirmation matches the balance the club actually starts with | Kick-off preview said **Bank 1.5M**; after founding the campus top bar and Owner's Program both say **V4M** (board's opening balance). ~2.5M unexplained. | `screenshots/07-kickoff-step.png` vs `screenshots/11-campus.png`, `screenshots/13-owner-program.png` | Level 0, ~18 min |
| P02-02 | S3 | copy | Found your club step 2 "Club" (`/start`) | 1440×900 | Type a club name; the auto-derived code collides | A validation message names **which** field is rejected | Message reads only "That name or code is taken" — with 3 fields (name/code/ground) you can't tell whether to rename the club or change the 3-letter code. Cost me several retries. | `screenshots/06b-diagnose.png`, `screenshots/06c-diagnose.png` | Level 0, ~15 min |
| P02-03 | S3 | flow | Found your club wizard (`/start`) after the club exists | 1440×900 | Found club → reopen `/start` (a link the wizard itself exposes) | Founding flow never offers to re-found once you own a club | Wizard reopens at step 1 "Home" with a **different suggested home** (Philamentia Central, Bellean) and an enabled "Next: your club"; only a small "Back to my club" button reveals you already have one. Risk of a second club / disorientation. | `screenshots/10-start-again.png` | Level 0, ~20 min |
| P02-04 | S4 | visual/feedback | Campus owner's-program chip | 1440×900 | Load campus; try to click the "Owner's program" chip | The primary "next task" chip is stable enough to click | The chip **bobs continuously**, so Playwright refuses to click it ("element is not stable" for 30s). A human can still hit it, but an automated/assistive path cannot. | `screenshots/11-campus.png` | Level 0, ~20 min |
