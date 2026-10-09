// P09 step 02 — open the New manager (join) flow.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1200);
  await s.page.getByRole('link', { name: 'New manager' }).click();
  await s.page.waitForTimeout(1500);
  console.log('URL:', s.page.url());
  const aria = await s.ariaSnapshot();
  console.log('--- ARIA ---');
  console.log(aria);
  console.log('--- /ARIA ---');
  await s.shot('02-join');
  await s.decide('Tapped "New manager" in the landing toggle; captured the join form.');
} finally {
  await s.close();
}
console.log('DONE');
