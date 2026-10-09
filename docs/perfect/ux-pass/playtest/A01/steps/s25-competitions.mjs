// A01 Session 2, step 25: admin Competitions + a competition's editions.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 120) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/a/competitions', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(5000);
  await s.shot('50-s2-competitions');
  console.log('-----ARIA competitions (head)-----');
  console.log(trim(await s.ariaSnapshot(), 90));
  console.log('-----END-----');

  // Open the first competition-ish control to inspect editions.
  const openers = [
    () => s.page.getByRole('button', { name: /years|editions|open|edit/i }).first(),
    () => s.page.locator('text=/Years|Editions/i').first(),
  ];
  for (const f of openers) {
    try {
      const el = f();
      if (await el.count()) {
        await el.click({ timeout: 5000 });
        await s.page.waitForTimeout(3500);
        break;
      }
    } catch {}
  }
  console.log('[url after click]', s.page.url());
  await s.shot('51-s2-competition-detail', { fullPage: true });
  console.log('-----ARIA detail (head)-----');
  console.log(trim(await s.ariaSnapshot(), 90));
  console.log('-----END-----');
  await s.decide('Session 2: opened admin Competitions and drilled into the first competition to inspect editions.');
} finally {
  await s.close();
}
