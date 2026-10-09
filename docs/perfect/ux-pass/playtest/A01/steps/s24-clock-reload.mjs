// A01 Session 2, step 24: does "Now:" advance across reloads, or is the clock stalled?
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const readNow = async () => {
  const t = await s.page.locator('text=/Now: day \\d+/').first().innerText().catch(() => '(no now line)');
  return t.replace(/\s+/g, ' ').trim();
};
const readNext = async () => {
  const t = await s.page.locator('text=/Next tick:/').first().innerText().catch(() => '(no next line)');
  return t.replace(/\s+/g, ' ').trim();
};
try {
  for (let i = 0; i < 3; i++) {
    await s.page.goto(s.url + '/a/calendar', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await s.page.waitForTimeout(4000);
    const now = await readNow();
    const next = await readNext();
    console.log(`[read ${i}] wall=${new Date().toISOString()} | ${now} | ${next}`);
    if (i === 0) await s.shot('48-s2-clock-reload-0');
    if (i < 2) await s.page.waitForTimeout(35000); // ~1 game hour at scale 4
  }
  await s.shot('49-s2-clock-reload-2');
  await s.decide('Session 2: re-read the clock across 3 reloads over ~70s to test if the world advances.');
} finally {
  await s.close();
}
