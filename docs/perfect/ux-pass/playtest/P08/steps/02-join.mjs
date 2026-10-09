// P08 step 02 — "New manager" registration screen.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('link', { name: 'New manager' }).click();
  await s.page.waitForTimeout(1500);
  console.log('URL:', s.page.url());
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.shot('02-join');
  await s.decide('Tapped "New manager". Noting the fields and any invite-code field.');
} catch (e) {
  await s.shot('02-join-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
