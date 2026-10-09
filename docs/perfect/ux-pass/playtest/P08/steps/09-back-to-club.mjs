// P08 step 09 — follow "Back to my club" from the post-founding /start wizard.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('09-start-after-founding');
  const back = s.page.getByRole('button', { name: 'Back to my club' });
  if (await back.count()) {
    await back.click();
    await s.page.waitForTimeout(5000);
  }
  console.log('URL:', s.page.url());
  await s.shot('09-campus');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Tapped "Back to my club" from the post-founding /start wizard.');
} catch (e) {
  await s.shot('09-campus-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
