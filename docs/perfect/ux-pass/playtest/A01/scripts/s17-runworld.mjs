import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 40) => t.split('\n').slice(0, n).join('\n');
try {
  // Reach the console via the UI path (loads header state; see A01-06).
  await s.page.goto(s.url + '/u/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4000);
  await s.page.getByRole('link', { name: /Admin console/i }).click();
  await s.page.waitForTimeout(3000);
  await s.page.getByText('World & Calendar', { exact: true }).click();
  await s.page.waitForTimeout(4000);
  const before = await s.page.locator('text=/^Day \\d+ -/').first().textContent().catch(() => '(unknown)');
  console.log('[A01] day before=', before);
  await s.shot('30-clock-before');

  // Admin action: advance one world day.
  await s.page.getByRole('button', { name: /^Advance one day$/i }).click();
  await s.page.waitForTimeout(5000);
  const after = await s.page.locator('text=/^Day \\d+ -/').first().textContent().catch(() => '(unknown)');
  console.log('[A01] day after advance-one=', after);
  await s.shot('31-clock-advanced-one');
  console.log('-----ARIA (head)-----');
  console.log(trim(await s.ariaSnapshot(), 30));
  console.log('-----END-----');
  await s.decide(`Advanced one world day (${before} -> ${after}) as the admin.`);
} finally {
  await s.close();
}
