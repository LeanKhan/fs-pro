# P05 — SUMMARY (Keyboard-only + screen-reader semantics)

Viewport 1440×900, keyboard only. Client `http://localhost:4173` (prod build
`e4db26c`). Club **Keyboard FC (KBD)**, Sdev Central. All times UTC.
**Interim report — the run was cut short by a Windows-host interop outage (§
"Blocked" below); it will be updated if the instance comes back within the cap.**

## Outcome

| | |
| --- | --- |
| Level reached | **Level 0** (owner programme step 1 of 4, "Manager", started; signed a manager) |
| Level 1 reached | **not reached** (blocked before it) |
| Level 2 reached | **no** |
| Sessions | 3 sessions; 2 real breaks forced by the host outage |
| Wall time played | ≈ 11:25Z–14:02Z (≈ 2 h 37 m), of which **≈ 90 min was a hard environment block** |
| Stop reason | **D5 environment block**: Windows interop died and the API became unreachable; Playwright (win32-native `node_modules`) cannot launch, and a WSL-side browser cannot reach the API. Not a game-side S1. |

## Accessibility status (the P05 lens)

This is the important section. The build is **playable but not screen-reader
grade**. Registration and founding can be completed keyboard-only, focus rings
are clearly visible, and the advisor tip is a proper live region — those are
real strengths. Against that:

- **Modals are not dialogs.** The campus welcome/return overlays have no
  `role="dialog"`, no `aria-modal`, no focus move and no focus trap; focus
  starts on `body` and the dismiss button is the **27th** tab stop. Escape does
  nothing. (P05-01/02)
- **The owner-program Manager list is hostile to assistive tech.** 200 cards,
  ~400 tab stops, no headings, and every action announces the *same* name
  ("Sign this manager" / "Reveal the exact attributes") with no manager
  identity; visible labels ("Sign", "Interview · V25,000") are not in the
  accessible name. (P05-07)
- **Focus order regressions**: inside each manager card, "Sign" (lower) is
  focused before "Interview" (upper) — reverse of reading order (P05-08).
- **Invisible/unlabelled controls in the tab order**: the founding crest
  builder has three 0×0 `input[type=color]` exposed as unnamed textboxes
  (P05-03); colour swatches are announced as hex (P05-04).
- **The founding map is an image**, not a keyboard-choice of places (P05-06);
  the step headers of the owner program look like tabs but are plain text
  (P05-10).
- **Contrast** is mostly good (body/HUD/manager text 6:1–11:1). Two low spots:
  inactive step subtitles 3.38:1 (P05-15) and disabled submit 2.38:1 (P05-16,
  exempt).
- 16 issues total: 3 × S2, 6 × S3, 7 × S4 (see `ISSUES.md`). No S1 found
  in-game; the only S1-shaped event was the host outage above.

## Top 5 frustrations

1. The modal/focus management on the campus (P05-01) — as a screen-reader user
   I did not know a dialog had opened, and as a keyboard user I had to Tab
   through ~27 background controls, twice, to dismiss overlays.
2. The manager list (P05-07) — 400 tab stops of identically-named "Sign this
   manager" buttons.
3. The invisible, unnamed colour inputs in the crest builder (P05-03).
4. The owner-program "Manager" step taking several seconds with only a
   non-announced loading string, focus on `body` (P05-09).
5. The founding map being an image, so keyboard users can't choose a place
   (P05-06).

## Top 3 delights

1. The focus indicator is a clear, high-contrast lime outline — easy to follow
   (`03-join-focusorder.png`).
2. Registration → founding is completable keyboard-only with proper visible
   labels on every real field (name/email/username/password/club/code/ground).
3. The Vintra advisor is a `role="status"` live region, so its tips are
   announced; and colour swatches expose `[pressed]`.

## Moments I would have quit as a real player

- 11:41Z, first campus load: overlay with no dialog semantics, Escape dead,
  dismiss button 27 tabs away (P05-01). A screen-reader user would think the
  page is frozen.
- 12:01Z, opening the Manager list: several seconds of "Opening the owner's
  program…" with focus on `body` and no announcement (P05-09).

## Metrics — actions per key task (keyboard)

Measured where reached; the run stopped before most of the later tasks.

| Task | Key presses / actions | Reached? |
| --- | --- | --- |
| Register | 5 Tabs + 5 typed fields + Tab + Enter (≈ 12 actions) | yes |
| Found a club | 2 × Next + 3 fields + 3 crest clicks + Found (≈ 12 actions, but see P05-05: a reload loses it) | yes |
| Open the owner program | dismiss modals (27 Tabs each) + Tab×6 + Enter + Tab to "start" + Enter | yes |
| Sign a manager | Tab×~8 to the first "Sign this manager" + Enter | **partially** (action started; list load race) |
| Sign a player | — | no (not reached) |
| Start a build | — | no |
| Play a match | — | no |
| Set a plan (team sheet/lineup) | — | no |
| Find the league table | — | no |

## Blocked (environment)

From 12:31Z onward, every Windows-interop invocation failed with
`WSL (…): ERROR: UtilAcceptVsock:271: accept4 failed 110`:

```
$ cmd.exe /c "echo ok"
<3>WSL (90637 - ) ERROR: UtilAcceptVsock:271: accept4 failed 110
```

`/mnt/c/Windows/System32/cmd.exe` and `powershell.exe` fail identically, so
this is the WSL↔Windows vsock bridge, not the command. The repo's
`node_modules` is win32-native, so Playwright cannot be started from WSL while
interop is down. I polled every ~30–60 s from 12:31Z to 14:02Z (**≈ 90 min**)
with no recovery.

**Workaround attempted.** WSL *can* reach the client directly — `curl
http://localhost:4173` returns 200, and a Linux Chromium installed in
`/tmp/opencode/pw05` (with locally-extracted `libnspr4`/`libnss3`/
`libasound2`) loads the client shell. But **every `/api/` request fails** to
`http://localhost:3010` (`ERR_SOCKET_NOT_CONNECTED` / `ERR_CONNECTION_RESET`).
From WSL only 4173 (bound `127.0.0.1`) is reachable; 3010, 3011, 3016, 3005,
3004 and 5050 (all `0.0.0.0`-bound) are refused. So the game cannot be played
through this path either.

**For the lead / INSTANCE-LOG:** check the Node API on 3010 first. The failure
is consistent with either (a) the API (and possibly other services) dying in
the same host event, or (b) WSL relaying only `127.0.0.1`-bound Windows
services while Windows Firewall blocks the host-IP route for `0.0.0.0`-bound
ones. I cannot distinguish these from inside WSL. Either way, Pass 1 is paused
for P05 until the instance is reachable again. Not a game defect.

## Evidence

- Screenshots: `playtest/P05/screenshots/*.png` (24 files).
- Traces: `playtest/P05/traces/*.zip` (20 files).
- Scripts: `.playtest-runtime/p05/step*.mjs`, `p05lib.mjs`,
  `png_contrast.py` (throwaway, untracked).
