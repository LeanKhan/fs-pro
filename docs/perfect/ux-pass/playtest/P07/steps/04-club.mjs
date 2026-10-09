import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2000);
  await s.page.getByRole('button', { name: 'Next: your club' }).click();
  await s.page.waitForTimeout(2500);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('04-your-club');
  await s.decide('Advanced from Home to "Club" step of founding. "Found your club" and "3/6 clubs" needed a second read.');
} catch (e) {
  await s.shot('04-error');
  await s.decide('Blocked advancing founding step: ' + e.message);
} finally {
  await s.close();
}
