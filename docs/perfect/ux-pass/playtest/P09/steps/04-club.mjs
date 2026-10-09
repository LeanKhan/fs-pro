// P09 step 04 — founding flow: Your home -> Your club.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2000);
  await s.page.getByRole('button', { name: /Next: your club/ }).click();
  await s.page.waitForTimeout(1500);
  const aria = await s.ariaSnapshot();
  console.log('--- ARIA ---');
  console.log(aria);
  console.log('--- /ARIA ---');
  await s.shot('04-club-step');
  await s.decide('Tapped "Next: your club" in the founding flow; captured the club step.');
} finally {
  await s.close();
}
console.log('DONE');
