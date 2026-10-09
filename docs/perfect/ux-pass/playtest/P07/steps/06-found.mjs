import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2000);
  await s.shot('06a-before-found');
  await s.page.getByRole('button', { name: 'Found P07 Athletic' }).click();
  await s.page.waitForTimeout(8000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('06b-campus');
  await s.page.screenshot({ path: '/tmp/opencode/p07-campus-full.png', fullPage: true }).catch(() => {});
  await s.decide('Pressed "Found P07 Athletic". Not obvious whether founding is final; no confirmation dialog appeared.');
} catch (e) {
  await s.shot('06-error');
  await s.decide('Blocked founding club: ' + e.message);
} finally {
  await s.close();
}
