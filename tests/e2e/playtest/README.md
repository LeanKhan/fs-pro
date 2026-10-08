# Playtest harness (`tests/e2e/playtest/`)

One small helper that gives a **playtester agent** an isolated, persona-shaped
Playwright browser context and captures the evidence the UX pass needs. Built
for Pass 0 (agent 0B) of `docs/perfect/ux-pass/`.

It is intentionally **not** a game driver:

- no game selectors, no game flows, no shortcuts;
- it never reads game source or specs. The only file it reads is
  `docs/perfect/ux-pass/INSTANCE-LOG.md`, and only to find the client URL;
- it does exactly four things: open the client URL, screenshot, expose the
  accessibility snapshot, and let the calling agent decide the next action.

## Files

| File | Purpose |
| --- | --- |
| `harness.mjs` | `personaContext(persona)` and the evidence helpers. |
| `example-session.mjs` | Screenshot → decide → act loop (template, no selectors). |
| `README.md` | This file. |

## Run it

The repo's `node_modules` is win32-native, so run through **Windows Node**
(`cmd.exe /c`) from the repo root:

```sh
# One-shot example session for a persona (P01..P10, A01):
cmd.exe /c "node tests/e2e/playtest/example-session.mjs P01"

# or via the npm script:
cmd.exe /c "npm run playtest --workspace fs-pro-e2e -- P01"
```

The client URL comes from `docs/perfect/ux-pass/INSTANCE-LOG.md` when 0A has
written it, otherwise `http://localhost:8080`. Override with
`PLAYTEST_BASE_URL`. Set `PLAYTEST_HEADED=1` to watch the browser.

## Use it in a step script

The agent writes a throwaway `.mjs` script per step. The session persists
cookies/localStorage to `<id>/state.json`, so the next script stays logged in:

```js
import { personaContext } from './tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
try {
  await s.page.goto(s.url);            // open the client
  console.log(await s.ariaSnapshot()); // read what's on screen
  await s.shot('01-landing');          // evidence: <id>/screenshots/01-landing.png
  await s.decide('What I chose and why'); // one line: <id>/DIARY.md
  // act on what you saw (generic Playwright API — your choice, no game selectors)
  await s.close();                     // saves state, writes <id>/traces/*.zip
} catch (e) {
  await s.shot('error');               // still capture the failure
  await s.decide(`Blocked: ${e.message}`);
  await s.close();
}
```

### API

`personaContext(persona, opts?) → Promise<session>`

- `persona`: a persona id (`P01`…`P10`, `A01`) or an inline
  `{ id, viewport, touch?, mobile?, cpuThrottle?, network?, reducedMotion? }`.
- `opts.url`: override the client URL for this session.

The session exposes:

| Member | Description |
| --- | --- |
| `context` | The configured Playwright `BrowserContext`. |
| `page` | The persona's `Page`. |
| `url` | The resolved client URL. |
| `shot(name, opts?)` | PNG to `<id>/screenshots/<name>.png`. `{ fullPage: true }` for the whole page. |
| `ariaSnapshot()` | The accessibility snapshot of `<body>` as text. |
| `startTracing()` / `stopTracing(name?)` | Tracing is **on** from creation; `stop` writes `<id>/traces/<name>.zip`. |
| `decide(note)` | One timestamped line appended to `<id>/DIARY.md`. |
| `saveState()` | Persist login to `<id>/state.json` (also done on `close`). |
| `close()` | Save state, stop tracing, close browser. Always call it. |

### Personas (FOR-AGENTS.md §3)

| ID | Viewport / input | Extra |
| --- | --- | --- |
| P01 | 390×844 touch | mobile |
| P02 | 1440×900 mouse | |
| P03 | 1440×900 mouse | |
| P04 | 390×844 touch | mobile |
| P05 | 1440×900 keyboard | |
| P06 | 360×740 touch | CPU 4×, Slow 4G, `prefers-reduced-motion` |
| P07 | 1280×800 mouse | |
| P08 | 390×844 touch | mobile |
| P09 | 768×1024 touch | tablet (rotate with `page.setViewportSize`) |
| P10 | 1920×1080 mouse | |
| A01 | 1440×900 mouse | admin |

### Evidence locations

```
docs/perfect/ux-pass/playtest/<id>/screenshots/*.png
docs/perfect/ux-pass/playtest/<id>/traces/*.zip
docs/perfect/ux-pass/playtest/<id>/DIARY.md
docs/perfect/ux-pass/playtest/<id>/state.json   (login state; gitignore)
```

## What this must never become

If you are an agent adding a convenience like "click the Play button", stop.
That is U2: players drive **only** the game's UI, decide from what they see, and
a missing affordance is a finding, not a shortcut. Keep this file game-agnostic.
