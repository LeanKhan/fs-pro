// A01 Session 2, step 32: admin Year Calendar.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 70) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/a/calendar', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4500);
  await s.page.getByRole('button', { name: /Open Year Calendar/i }).click({ timeout: 8000 }).catch(async () => {
    await s.page.getByText(/OPEN YEAR CALENDAR/i).first().click({ timeout: 5000 }).catch(() => {});
  });
  await s.page.waitForTimeout(4500);
  console.log('[url]', s.page.url());
  await s.shot('65-s2-year-calendar', { fullPage: true });
  const aria = await s.ariaSnapshot();
  const i = aria.indexOf('- main:');
  console.log('-----YEAR CALENDAR main-----');
  console.log(trim(aria.slice(i >= 0 ? i : 0), 70));
  console.log('-----END-----');
  await s.decide(`Session 2: opened the admin Year Calendar (${s.page.url()}).`);
} finally {
  await s.close();
}
