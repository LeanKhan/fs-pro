import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/auth/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('textbox', { name: 'Username' }).fill('playtestadmin');
  await s.page.getByRole('textbox', { name: 'Password' }).fill('Playtest-Admin-2026!');
  await s.shot('02-login-filled');
  await s.decide('Entered admin username + password from INSTANCE-LOG; captured filled form.');
  await s.page.getByRole('button', { name: 'Sign in' }).click();
  await s.page.waitForTimeout(4000);
  console.log('[A01] afterLogin url=', s.page.url());
  console.log('[A01] title=', await s.page.title());
  await s.shot('03-after-login');
  const aria = await s.ariaSnapshot();
  console.log('-----ARIA-----');
  console.log(aria);
  console.log('-----END ARIA-----');
  await s.decide(`Logged in as admin; landed on ${s.page.url()}.`);
} finally {
  await s.close();
}
