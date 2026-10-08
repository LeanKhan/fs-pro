// P03 step 01 — open the client, look around. No game selectors.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  console.log('[url]', s.page.url());
  console.log('[title]', await s.page.title());
  await s.shot('01-landing');
  const aria = await s.ariaSnapshot();
  console.log('===== ARIA =====');
  console.log(aria);
  console.log('===== /ARIA =====');
  await s.decide(`Opened ${s.url}; landing screenshot 01-landing.`);
} catch (e) {
  await s.shot('01-error');
  await s.decide(`Blocked at landing: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
