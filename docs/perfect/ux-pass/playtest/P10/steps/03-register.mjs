// P10 step 03: register the new manager through the UI.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1000);
  await s.page.goto(`${s.url}/auth/join`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1000);

  await s.page.getByRole('textbox', { name: 'Your name' }).fill('Playtest P10');
  await s.page.getByRole('textbox', { name: /Email to confirm/ }).fill('playtestP10@example.com');
  await s.page.getByRole('textbox', { name: /Username/ }).fill('playtestP10');
  await s.page.getByRole('textbox', { name: /^Password at least/ }).fill('Playtest-P10-2026!');
  await s.page.getByRole('textbox', { name: 'Password again' }).fill('Playtest-P10-2026!');
  await s.page.waitForTimeout(500);
  await s.shot('03-join-filled');

  await s.page.getByRole('button', { name: 'Create account' }).click();
  await s.page.waitForTimeout(4000);
  await s.shot('03b-after-register');
  const aria = await s.ariaSnapshot();
  fs.writeFileSync(`${s.dir}\\ua-03-after-register.txt`, aria, 'utf8');
  console.log('=== URL ===', s.page.url());
  console.log(aria);
  await s.decide('Registered playtestP10 / Playtest-P10-2026! and captured the post-registration screen.');
} finally {
  await s.close();
}
