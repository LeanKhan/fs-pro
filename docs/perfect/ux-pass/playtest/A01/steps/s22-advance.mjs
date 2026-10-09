// A01 Session 2, step 22: live clock detail + admin "Advance one day".
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 120) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/a/calendar', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4500);
  await s.shot('43-s2-calendar-top', { fullPage: true });
  const day0 = (await s.page.locator('text=/Day \\d+ -/').first().textContent().catch(() => '(unread)')).trim();
  console.log('[clock before]', day0);

  // Read the live-clock block text (Next tick / Last tick etc.)
  const clockText = await s.page
    .locator('text=/Live|Next tick|Last tick|Current hour/i')
    .first()
    .locator('xpath=ancestor::*[self::div or self::section][3]')
    .innerText()
    .catch(() => '(no clock block)');
  console.log('-----CLOCK BLOCK-----');
  console.log(trim(clockText, 40));
  console.log('-----END-----');

  // Scroll the clock block into view for a clean screenshot.
  await s.page.getByText(/Live Game Clock/i).first().scrollIntoViewIfNeeded().catch(() => {});
  await s.page.waitForTimeout(800);
  await s.shot('44-s2-live-clock');

  // Admin action: advance the world one day.
  await s.page.getByRole('button', { name: /^Advance one day$/i }).click();
  await s.page.waitForTimeout(6000);
  const day1 = (await s.page.locator('text=/Day \\d+ -/').first().textContent().catch(() => '(unread)')).trim();
  console.log('[clock after advance-one]', day1);
  await s.shot('45-s2-advanced-one-day');
  await s.decide(`Session 2: admin clock read (${day0}) then clicked "Advance one day" -> ${day1}.`);
} finally {
  await s.close();
}
