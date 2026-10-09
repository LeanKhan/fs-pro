// P08 step 08 — enter the campus ("Go to your ground").
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  const go = s.page.getByRole('button', { name: 'Go to your ground' });
  if (await go.count()) {
    await go.click();
    await s.page.waitForTimeout(5000);
  }
  console.log('URL:', s.page.url());
  await s.shot('08-campus');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Entered the ground/campus. Looking for the town page and the invite link the founding card mentioned.');
} catch (e) {
  await s.shot('08-campus-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
