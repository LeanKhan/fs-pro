import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(2500);
  await s.decide('Re-opened /start (still logged in) to walk the founding flow and look for admin access.');
  await s.page.getByRole('button', { name: /Next: your club/i }).click();
  await s.page.waitForTimeout(2000);
  await s.shot('04-start-club');
  console.log('[A01] url=', s.page.url());
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide('Clicked "Next: your club" on the founding flow.');
} finally {
  await s.close();
}
