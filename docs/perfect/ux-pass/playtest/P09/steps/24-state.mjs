// P09 step 24 — inspect current state (what modal is open).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';
const watchdog = setTimeout(() => process.exit(0), 90000);
const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step24-state-aria.txt', aria);
  console.log(aria);
  await s.shot('24-state');
} finally { clearTimeout(watchdog); await s.close({ keepTracing: true }).catch(() => {}); }
console.log('DONE'); process.exit(0);
