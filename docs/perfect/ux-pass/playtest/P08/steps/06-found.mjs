// P08 step 06 — found the club; see post-founding placement and campus.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1800);
  const found = s.page.getByRole('button', { name: /Found Invite Rovers|Found/ });
  if (await found.count()) {
    await found.first().click();
    await s.page.waitForTimeout(4000);
  }
  console.log('URL:', s.page.url());
  await s.shot('06-after-found');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Founded Invite Rovers; capturing the post-founding confirmation and where I landed.');
} catch (e) {
  await s.shot('06-after-found-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
