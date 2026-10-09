// Example playtest session — the screenshot -> decide -> act loop.
//
// This is a TEMPLATE, not a script. It shows the smallest legal loop a
// playtester agent runs, and it contains NO game selectors and NO game flow:
// every action is generic (open the URL, screenshot, read the a11y tree, press
// a key). Real sessions replace the single `act` line with whatever the agent
// decides after looking at the screenshot and the accessibility snapshot.
//
// Run it (Windows Node, from the repo root):
//   cmd.exe /c "node tests/e2e/playtest/example-session.mjs P01"
// or through the npm script:
//   cmd.exe /c "npm run playtest --workspace fs-pro-e2e -- P01"
//
// Evidence lands in docs/perfect/ux-pass/playtest/<PERSONA>/{screenshots,traces}
// and the diary in docs/perfect/ux-pass/playtest/<PERSONA>/DIARY.md.

import { personaContext } from './harness.mjs';

const personaId = process.argv[2] ?? 'P01';
const session = await personaContext(personaId);

try {
  console.log(`[example] persona ${session.id} (${session.label})`);
  console.log(`[example] viewport ${session.spec.viewport.width}x${session.spec.viewport.height}`);
  console.log(`[example] client   ${session.url}`);

  // --- 1. Open the client URL the lead recorded --------------------------
  // domcontentloaded (not load): on P06's Slow 4G profile the full `load` event
  // can take far longer than any sane timeout — and that delay is itself a
  // finding. Here we just want the DOM so the agent has something to look at.
  try {
    await session.page.goto(session.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (err) {
    // The stack may not be up yet; still capture whatever the browser shows.
    console.warn(`[example] navigation warning: ${err.message}`);
  }

  // --- 2. Screenshot -----------------------------------------------------
  const shot = await session.shot('01-landing');
  console.log(`[example] screenshot -> ${shot}`);

  // --- 3. Expose the accessibility snapshot (what a person can perceive) --
  const aria = await session.ariaSnapshot();
  console.log('[example] accessibility snapshot ---------------------------------');
  console.log(aria);
  console.log('------------------------------------------------------------------');

  // --- 4. Decide (one line, appended to the diary) -----------------------
  await session.decide(`Opened ${session.url}; a11y tree has ${aria.split('\n').length} lines.`);

  // --- 5. Act: generic keyboard focus probe (NO game selector) -----------
  // A real agent replaces this with the action its decision calls for, e.g.
  // page.getByRole(...) on something it can actually see in the snapshot.
  await session.page.keyboard.press('Tab');
  const after = await session.shot('02-after-tab');
  await session.decide('Probed focus order with a single Tab; captured the result.');
  console.log(`[example] screenshot -> ${after}`);

  console.log('[example] done. State saved; next step script stays logged in.');
} finally {
  await session.close();
}
