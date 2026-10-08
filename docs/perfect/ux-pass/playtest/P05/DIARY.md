# P05 — Keyboard-only + screen-reader semantics — DIARY

Persona: P05. Viewport 1440×900, keyboard only (no mouse). Client:
`http://localhost:4173` (production build `e4db26c`). Club: **Keyboard FC**
(KBD), founded in Sdev Central, Kev. Rule: judge only from the accessibility
tree (`ariaSnapshot()`) and what a keyboard generates. All timestamps UTC.

Mood scale 1 (frustrated/quit) – 5 (delighted).

---

## Session 1 — 11:25–11:41Z — first 10 minutes (mood 3)

- 11:25 Opened the client. Landed on `/auth/login`. The a11y tree is small and
  clean: `main`, an image with alt "FS Pro", a `navigation "Sign in or join"`
  with two links, username/password textboxes, a **disabled** "Sign in" button
  and a "Forgot your password?" link. Good start (mood 4). Screenshot
  `01-landing.png`.
- 11:26 Followed the **"New manager"** link (it is exposed as a link, not a
  tab). Join form is labelled: Your name / Email / Username / Password /
  Password again. The button is disabled until the form is valid. Screenshot
  `02-join.png`.
- 11:28 Probed focus order with 14 Tabs. Fields, then the footer "Credits"
  link, then the browser, then back to the two links, then the fields. I had
  expected the two links first; the page puts **autofocus on "Your name"**, so
  the first Tab skips the "Sign in / New manager" links. Minor. The focus ring
  is a clear lime outline — good. Screenshot `03-join-focusorder.png`.
- 11:30 Registered entirely with the keyboard (Tab + type + Enter). Success →
  `/start`. No mouse needed (mood 4).
- 11:33 Found the founding map: an `img "World map"` whose alt is just the list
  of country names; zoom buttons; the "1. Home / 2. Club / 3. Kick-off" step
  buttons; a "Next: your club" button. **I could not reach any map pin** — the
  places on the map are not in the tab order, so as a keyboard user I can only
  accept the auto-chosen home (Sdev Central). Screenshot `05-after-register.png`,
  `06-start-focusorder.png`.
- 11:36 Club step. The crest builder is a wall of buttons: Shape, Pattern,
  Emblem, then three colour palettes. The colour swatches are announced as hex
  codes ("Kit colour #6a3fb5"), and after each palette there are **three
  focusable `input[type=color]` that are invisible (0×0) and have no name** —
  tabbing lands on nothing. Screenshots `07-start-club.png`,
  `08-club-step-full.png`, `09-club-filled.png`. This is the first real
  accessibility problem (mood drops to 3).
- 11:38 I reloaded `/start` to re-check something and **lost all the founding
  input** — it reset to step 1. Had to redo the wizard in one pass.
- 11:39 Founded the club (`13-kickoff-confirm.png` → `14-campus.png`).
- 11:41 Campus. A "Welcome to Keyboard FC" overlay covers the middle of the
  screen. It is **not exposed as a dialog**, focus is on `body`, and **Escape
  does nothing**. I counted the tab stops: "Let's go!" is the **27th** control,
  after every top-bar icon, the advisor, the whole First-steps checklist, the
  dock and the PLAY button. A screen-reader user is never told a modal opened.
  Screenshots `15-ground.png`, `16-modal-escape.png`. Mood 3 → 2.

*Break: host interop dropped at ~11:43Z (all `cmd.exe` calls failed); I used
the pause to write notes. Play resumed 11:51Z. This is a real break in the D4
sense — the game world kept ticking (Day advanced).*

## Session 2 — 11:51–12:11Z — owner program (mood 2)

- 11:51 Dismissed the first overlay by tabbing 27 times and pressing Enter. A
  **second** overlay ("While you were away") appeared with the same "Let's go!"
  and the same 27-tab trip. Screenshots `17-campus-clean.png`,
  `18-campus-after-modals.png`.
- 11:54–11:58 Reached the **Owner's program** chip by Tab (6th stop) and opened
  it with Enter. The 3D chip is animated, so a Playwright *click* reported the
  element "not stable"; keyboard activation worked. The Program header reads
  Programme XP 0/54, Budget V3.3M. The four step headers (Manager / Squad /
  Facilities / Level 1) **look like tabs but are plain text in the a11y tree**
  — I can't activate them. Screenshots `19a-owner-focused.png`,
  `19-owner-program.png`.
- 12:01 Started step 1. The screen took several seconds; the only a11y content
  was the text **"Opening the owner's program…"**. When it loaded, the Manager
  list is **200 cards = ~400 tab stops**. Every card's two buttons announce the
  **same** names — "Sign this manager" and "Reveal the exact attributes" —
  without the manager's name, so a screen reader hears "Sign this manager"
  two hundred times. The visible text ("Sign", "Interview · V25,000") is *not*
  contained in the accessible name (Label-in-Name). Within a card, Tab visits
  "Sign this manager" (lower) **before** "Reveal the exact attributes" (upper)
  — the reverse of reading order. Screenshot `20-program-manager.png`,
  `22-manager-tabtrace.png`. Mood 2.
- 12:06–12:11 Tried to sign the first manager. My first two attempts failed
  because the list had not rendered (loading text only); with a proper wait I
  reached "Sign this manager". Screenshot `23-sign-confirm.png`.

*Break 12:11–12:18Z: another interop gap. Resumed 12:18Z.*

## Session 3 — 12:18Z– … (interrupted)

- 12:21 Attempted to sign a manager. The program screen was still loading
  ("Opening the owner's program…"), so my first two attempts to Tab to a Sign
  button found nothing (focus stayed on `body`).
- 12:22 With a proper wait for the manager search box, I reached "Sign this
  manager" and pressed Enter. Screenshot `23-sign-confirm.png`.
- 12:28–12:31 Used the same screenshots to measure pixel contrast objectively
  (pure-Python PNG sampler). Good news: campus HUD, manager-card text and body
  copy are all ≥ 6:1. Two low spots: the inactive Owner's-Program step
  subtitles (3.38:1) and the disabled "Create account" label (2.38:1).
- 12:31 **HOST OUTAGE.** Every Windows-interop call (`cmd.exe`, `powershell.exe`,
  absolute paths) began failing with
  `WSL (…): ERROR: UtilAcceptVsock:271: accept4 failed 110`. Because the repo's
  `node_modules` is win32-native, I cannot launch Playwright at all. I kept
  polling every ~30–60 s; still failing at 14:02Z (~90 min). Logged as an
  environment blocker, not a game issue.

### Workaround attempt (13:58Z–14:05Z)

Rather than just wait, I checked whether I could drive the *same* client from
WSL without Windows interop:

- `curl http://localhost:4173` from WSL returned **200** (WSL's Windows
  localhost relay works and does not depend on the broken vsock interop).
- WSL has a Linux Node 24 and a cached Linux Chromium
  (`~/.cache/ms-playwright/chromium-1243`). I installed `playwright-core@1.55`
  in `/tmp/opencode/pw05`, extracted the missing shared libraries
  (`libnspr4`/`libnss3`/`libasound2t64`) into a local sysroot, and launched
  Chromium against `http://localhost:4173`.
- **Result:** the client shell loads (title "FSPro", the login screen renders),
  but **every `/api/` request fails** — `net::ERR_SOCKET_NOT_CONNECTED` /
  `ERR_CONNECTION_RESET` to `http://localhost:3010/...`. From WSL, only 4173
  (bound `127.0.0.1`) is reachable; every other service — 3010, 3011, 3016,
  3005, 3004, 5050 (`0.0.0.0`-bound) — returns connection-refused. So the
  workaround cannot run the game either: the app cannot log in without the API.
- This is consistent with either (a) the API being down after the host
  event, or (b) WSL only relaying `127.0.0.1`-bound Windows services and
  Windows Firewall blocking the host-IP route for `0.0.0.0`-bound ones. I
  cannot distinguish (a) from (b) without Windows access, so the lead should
  check the API process on 3010 first.

**Stop: D5 environment block.** The instance's UI is unreachable from the only
tooling I have; I logged everything reachable and stopped. No Level 1/2.
