// A01 Session 2, step 23: watch the live clock tick and read the next-tick time.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const readNow = async () => {
  const t = await s.page.locator('text=/Now: day \\d+/').first().innerText().catch(() => '(no now line)');
  return t.replace(/\s+/g, ' ').trim();
};
try {
  await s.page.goto(s.url + '/a/calendar', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4500);
  await s.page.getByText(/Live Game Clock/i).first().scrollIntoViewIfNeeded().catch(() => {});
  await s.page.waitForTimeout(500);
  const now0 = await readNow();
  console.log('[t0]', now0);
  console.log('[t0 wall]', new Date().toISOString());
  await s.shot('46-s2-clock-t0');

  await s.page.waitForTimeout(70000); // ~2 game-hour ticks (30s each at scale 4)
  const now1 = await readNow();
  console.log('[t1]', now1);
  console.log('[t1 wall]', new Date().toISOString());
  await s.shot('47-s2-clock-t1');
  await s.decide(`Session 2: watched the live clock for 70s. ${now0}  =>  ${now1}.`);
} finally {
  await s.close();
}
