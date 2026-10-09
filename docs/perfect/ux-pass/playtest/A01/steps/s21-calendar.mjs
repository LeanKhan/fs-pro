// A01 Session 2, step 21: admin console home + World & Calendar clock read.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 70) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/u', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(3500);

  // Admin console is reachable from the game shell sidebar.
  await s.page.getByRole('link', { name: /Admin console/i }).click();
  await s.page.waitForTimeout(3500);
  console.log('[url after console]', s.page.url());
  await s.shot('41-s2-admin-home');
  console.log('-----ARIA admin home-----');
  console.log(trim(await s.ariaSnapshot(), 30));
  console.log('-----END-----');

  await s.page.getByText('World & Calendar', { exact: true }).click();
  await s.page.waitForTimeout(4000);
  const day = await s.page.locator('text=/Day \\d+ -/').first().textContent().catch(() => '(unread)');
  console.log('[clock]', day);
  await s.shot('42-s2-world-calendar');
  await s.decide(`Session 2: admin console home + World & Calendar read; clock shows ${day?.trim()}.`);
} finally {
  await s.close();
}
