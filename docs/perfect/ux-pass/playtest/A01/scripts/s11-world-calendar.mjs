import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/a', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(6000);
  await s.page.getByText('World & Calendar', { exact: true }).click();
  await s.page.waitForTimeout(4000);
  console.log('[A01] url=', s.page.url());
  await s.shot('16-world-calendar');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide('Opened World & Calendar in the admin console.');
} finally {
  await s.close();
}
