// P06 step 02 — New manager registration flow.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(`${s.url}/auth/join`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(2000);
  await s.shot('02-join');
  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria);
  console.log('------------------------------------------------------');
  await s.decide('Opened New manager registration form.');
} finally {
  await s.close();
}
