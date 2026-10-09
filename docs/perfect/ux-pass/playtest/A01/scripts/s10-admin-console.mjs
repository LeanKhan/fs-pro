import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/u/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(6000);
  await s.shot('14-account-settings');
  await s.page.getByRole('link', { name: /Admin console/i }).click();
  await s.page.waitForTimeout(4000);
  console.log('[A01] url=', s.page.url());
  await s.shot('15-admin-console');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide('Clicked the visible "Admin console" link.');
} finally {
  await s.close();
}
