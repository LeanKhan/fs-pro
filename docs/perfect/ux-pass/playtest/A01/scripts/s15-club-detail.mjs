import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 110) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/u/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4000);
  await s.page.getByRole('link', { name: /Admin console/i }).click();
  await s.page.waitForTimeout(3000);
  await s.page.getByText('Clubs', { exact: true }).click();
  await s.page.waitForTimeout(4000);
  await s.page.getByRole('textbox', { name: /Search/i }).fill('Keyboard');
  await s.page.waitForTimeout(2000);
  await s.shot('24-clubs-search');
  const row = s.page.getByRole('row', { name: /Keyboard FC/ }).first();
  console.log('[A01] Keyboard row count=', await row.count());
  await row.getByRole('button').first().click();
  await s.page.waitForTimeout(4000);
  console.log('[A01] url=', s.page.url());
  await s.shot('25-club-detail');
  console.log('-----CLUB DETAIL ARIA-----');
  console.log(trim(await s.ariaSnapshot(), 120));
  console.log('-----END-----');
  await s.decide('Opened a player club (Keyboard FC) from admin Clubs to look for moderation tools.');
} finally {
  await s.close();
}
