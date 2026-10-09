// P10 step 02: open the New manager (join) registration form.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('link', { name: 'New manager' }).click();
  await s.page.waitForTimeout(1500);
  await s.shot('02-join-form');
  await s.shot('02-join-form-full', { fullPage: true });
  const aria = await s.ariaSnapshot();
  fs.writeFileSync(`${s.dir}\\ua-02-join.txt`, aria, 'utf8');
  console.log('=== URL ===', s.page.url());
  console.log(aria);
  await s.decide('Opened the New manager registration form.');
} finally {
  await s.close();
}
