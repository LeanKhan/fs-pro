// P09 step 03 — fill join form and create the account.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url + '/auth/join', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1200);
  await s.page.getByRole('textbox', { name: 'Your name' }).fill('P09 Tablet');
  await s.page.getByRole('textbox', { name: /Email/ }).fill('playtestP09@example.com');
  await s.page.getByRole('textbox', { name: /Username/ }).fill('playtestP09');
  await s.page.getByRole('textbox', { name: /Password at least/ }).fill('Playtest-P09-2026!');
  await s.page.getByRole('textbox', { name: 'Password again' }).fill('Playtest-P09-2026!');
  await s.page.waitForTimeout(300);
  await s.shot('03-join-filled');
  const aria = await s.ariaSnapshot();
  console.log(aria);
  await s.page.getByRole('button', { name: 'Create account' }).click();
  await s.page.waitForTimeout(3500);
  console.log('URL after create:', s.page.url());
  const aria2 = await s.ariaSnapshot();
  console.log('--- ARIA AFTER ---');
  console.log(aria2);
  console.log('--- /ARIA ---');
  await s.shot('03-after-create');
  await s.decide('Filled join form as playtestP09 / Playtest-P09-2026! and tapped Create account.');
} finally {
  await s.close();
}
console.log('DONE');
