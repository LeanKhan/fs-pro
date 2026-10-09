import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/auth/join', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1500);
  await s.page.getByLabel('Your name', { exact: true }).fill('P07 Manager');
  await s.page.getByLabel('Email to confirm your account and reset your password', { exact: true }).fill('playtest.p07@example.com');
  await s.page.getByLabel('Username 3-24 letters, numbers, . _ -', { exact: true }).fill('playtestP07');
  await s.page.getByLabel('Password at least 8 characters', { exact: true }).fill('Playtest-P07-2026!');
  await s.page.getByLabel('Password again', { exact: true }).fill('Playtest-P07-2026!');
  await s.shot('03a-form-filled', { fullPage: true });
  await s.page.getByRole('button', { name: 'Create account' }).click();
  await s.page.waitForTimeout(4000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('03b-after-create');
  await s.decide('Filled name/email/username/password and pressed Create account. Long email label felt like a sentence, not a field name.');
} catch (e) {
  await s.shot('03-error');
  await s.decide('Blocked creating account: ' + e.message);
} finally {
  await s.close();
}
