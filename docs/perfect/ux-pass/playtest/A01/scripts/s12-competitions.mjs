import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/a', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(8000);
  await s.shot('17-admin-home-direct');
  await s.page.getByText('Competitions', { exact: true }).click();
  await s.page.waitForTimeout(4000);
  console.log('[A01] url=', s.page.url());
  await s.shot('18-competitions');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide('Opened admin Competitions to confirm competitions exist.');
} finally {
  await s.close();
}
