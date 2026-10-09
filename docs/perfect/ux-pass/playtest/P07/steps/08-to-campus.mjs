import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('07a-welcome');
  await s.page.getByRole('button', { name: /Back to my club/i }).click();
  await s.page.waitForTimeout(9000);
  console.log('URL after:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('08a-campus');
  await s.page.screenshot({ path: '/tmp/opencode/p07-campus.png', fullPage: true }).catch(() => {});
  await s.decide('Clicked "Back to my club" from the founding wizard and reached the campus.');
} catch (e) {
  await s.shot('08-error');
  await s.decide('Blocked reaching campus: ' + e.message);
} finally {
  await s.close();
}
