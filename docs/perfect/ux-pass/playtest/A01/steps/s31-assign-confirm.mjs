// A01 Session 2, step 31: does the Assign clubs dialog have a confirm action? (do NOT assign)
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 120) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/u/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4000);
  await s.page.getByRole('button', { name: /Assign clubs \(admin\)/i }).click({ timeout: 8000 });
  await s.page.waitForTimeout(3000);

  const dialog = s.page.getByRole('dialog');
  const norm = async () => (await dialog.getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  console.log('[dialog buttons before select]', JSON.stringify(await norm()));

  // Tick the first club checkbox (no confirm, we will not submit anything).
  const cb = dialog.getByRole('checkbox').first();
  await cb.check({ timeout: 5000 }).catch((e) => console.log('[check err]', e.message));
  await s.page.waitForTimeout(1500);
  console.log('[dialog buttons after select]', JSON.stringify(await norm()));
  await s.shot('64-s2-assign-selected');

  // Any button other than CLOSE would be the confirm; report it but do not click it.
  const others = (await norm()).filter((t) => !/close/i.test(t));
  console.log('[potential confirm actions]', JSON.stringify(others));

  await s.page.getByRole('button', { name: /^Close$/i }).click({ timeout: 5000 }).catch(() => {});
  await s.decide('Session 2: checked a club in the Assign clubs dialog to see if a confirm action appears (did not assign).');
} finally {
  await s.close();
}
