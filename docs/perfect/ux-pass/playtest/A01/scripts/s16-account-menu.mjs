import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 90) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/a/clubs', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(6000);
  // Top-right account/avatar menu.
  const acct = s.page.getByRole('button', { name: /Account/i });
  console.log('[A01] account btn count=', await acct.count());
  if (await acct.count()) { await acct.last().click(); await s.page.waitForTimeout(1500); }
  await s.shot('26-account-menu');
  console.log('-----ACCOUNT MENU ARIA-----');
  console.log(trim(await s.ariaSnapshot(), 60));
  console.log('-----END-----');
  await s.decide('Opened the top-bar account menu in the admin console.');

  // Now the "Assign clubs (admin)" action from the account settings page.
  await s.page.goto(s.url + '/u/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(5000);
  const assign = s.page.getByRole('button', { name: /Assign clubs \(admin\)/i });
  console.log('[A01] assign btn count=', await assign.count());
  if (await assign.count()) {
    await assign.scrollIntoViewIfNeeded();
    await s.shot('27-account-assign-btn');
    await assign.click();
    await s.page.waitForTimeout(3000);
    console.log('[A01] url=', s.page.url());
    await s.shot('28-assign-clubs');
    console.log('-----ASSIGN ARIA-----');
    console.log(trim(await s.ariaSnapshot(), 120));
    console.log('-----END-----');
  }
  await s.decide('Opened the "Assign clubs (admin)" tool from Account.');
} finally {
  await s.close();
}
