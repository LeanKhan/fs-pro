// P05 Session 5c: reload, read XP, and enumerate campus controls (full a11y).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(9000);
  await dismissModals(s.page);
  const snap = await s.ariaSnapshot();
  console.log('=== FULL CAMPUS ARIA =====================================');
  console.log(snap);
  console.log('=== BUTTONS WITH NAMES ===================================');
  const names = await s.page.getByRole('button').evaluateAll((els) =>
    els.map((el) => (el.getAttribute('aria-label') || el.innerText || '').split('\n')[0].trim()).filter(Boolean)
  );
  console.log(JSON.stringify(names, null, 0));
  console.log(`unnamed buttons: ${await s.page.locator('button').evaluateAll((els) => els.filter((e) => !(e.getAttribute('aria-label') || e.innerText || '').trim()).length)}`);
  console.log(`shot=${await s.shot('40-campus-controls')}`);
  await s.decide('Reloaded campus; enumerated every control and read XP after the friendly.');
} finally {
  await s.close();
}
