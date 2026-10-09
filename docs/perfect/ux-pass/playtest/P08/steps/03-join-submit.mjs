// P08 step 03 — create the account.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/auth/join`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1200);
  const f = s.page.locator('input');
  await f.nth(0).fill('P08 Invited');
  await f.nth(1).fill('p08-playtest@example.com');
  await f.nth(2).fill('playtestP08');
  await f.nth(3).fill('Playtest-P08-2026!');
  await f.nth(4).fill('Playtest-P08-2026!');
  await s.shot('03-join-filled');
  await s.page.getByRole('button', { name: 'Create account' }).click();
  await s.page.waitForTimeout(3000);
  console.log('URL:', s.page.url());
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.shot('03-created');
  await s.decide('Filled the join form (no invite-code field exists on it) as playtestP08 and created the account.');
} catch (e) {
  await s.shot('03-created-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
