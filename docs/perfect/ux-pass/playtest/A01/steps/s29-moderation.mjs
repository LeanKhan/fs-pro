// A01 Session 2, step 29: moderation sweep — Home, account menu, Settings list.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 60) => t.split('\n').slice(0, n).join('\n');
const mainOf = (aria) => { const i = aria.indexOf('- main:'); return i >= 0 ? aria.slice(i) : aria; };
try {
  // Admin Home (any dashboard / quick links / moderation hub?).
  await s.page.goto(s.url + '/a', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(6000);
  await s.shot('59-s2-admin-home-full', { fullPage: true });
  console.log('-----ADMIN HOME main-----');
  console.log(trim(mainOf(await s.ariaSnapshot()), 25));
  console.log('-----END-----');

  // Account menu (top-right) — is there a users/reports entry?
  const acct = s.page.getByRole('button', { name: /account/i }).first();
  if (await acct.count()) {
    await acct.click({ timeout: 6000 }).catch(() => {});
    await s.page.waitForTimeout(2500);
    await s.shot('60-s2-account-menu');
    console.log('-----AFTER ACCOUNT CLICK aria-----');
    console.log(trim(await s.ariaSnapshot(), 60));
    console.log('-----END-----');
  }

  // Settings list in the manager view.
  await s.page.goto(s.url + '/u/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4000);
  await s.shot('61-s2-settings');
  console.log('-----SETTINGS main-----');
  console.log(trim(mainOf(await s.ariaSnapshot()), 40));
  console.log('-----END-----');
  await s.decide('Session 2: swept admin Home, the account menu and Settings for user/report/chat/news moderation entries.');
} finally {
  await s.close();
}
