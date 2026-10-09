// P03 step 07 — go to the ground (campus).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1200);
  const go = s.page.getByRole('button', { name: 'Go to your ground' });
  if (await go.count()) {
    await go.click();
  } else {
    await s.page.goto(s.url + '/', { waitUntil: 'domcontentloaded' });
  }
  await s.page.waitForTimeout(6000);
  console.log('[url]', s.page.url());
  await s.shot('07-campus');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide(`Entered campus at ${s.page.url()}.`);
} catch (e) {
  await s.shot('07-error');
  await s.decide(`Blocked entering campus: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
