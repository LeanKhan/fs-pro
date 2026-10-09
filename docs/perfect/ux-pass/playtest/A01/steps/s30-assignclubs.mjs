// A01 Session 2, step 30: explore the "Assign clubs (admin)" affordance.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 90) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/u/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4000);
  const btn = s.page.getByRole('button', { name: /Assign clubs \(admin\)/i });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await s.shot('62-s2-settings-assign');
  await btn.click({ timeout: 8000 });
  await s.page.waitForTimeout(3500);
  console.log('[url]', s.page.url());
  await s.shot('63-s2-assign-clubs');
  const aria = await s.ariaSnapshot();
  const i = aria.indexOf('- main:');
  console.log('-----ASSIGN main-----');
  console.log(trim(aria.slice(i >= 0 ? i : 0), 90));
  console.log('-----END-----');
  await s.decide('Session 2: opened the "Assign clubs (admin)" control from Settings > Account.');
} finally {
  await s.close();
}
