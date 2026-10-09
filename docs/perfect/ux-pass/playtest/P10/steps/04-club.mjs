// P10 step 04: founding flow step 2 (Club).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  console.log('start url', s.page.url());
  await s.shot('04-club-step');
  const aria0 = await s.ariaSnapshot();
  fs.writeFileSync(`${s.dir}\\ua-04-before.txt`, aria0, 'utf8');
  console.log('--- BEFORE (Home) ---');
  console.log(aria0);
  // Click Next: your club to reach step 2
  await s.page.getByRole('button', { name: /Next: your club/ }).click();
  await s.page.waitForTimeout(2000);
  await s.shot('04b-club-step');
  const aria = await s.ariaSnapshot();
  fs.writeFileSync(`${s.dir}\\ua-04-club.txt`, aria, 'utf8');
  console.log('=== URL ===', s.page.url());
  console.log('--- CLUB STEP ---');
  console.log(aria);
  await s.decide('Advanced from Home step to the Club step of the founding flow.');
} finally {
  await s.close();
}
