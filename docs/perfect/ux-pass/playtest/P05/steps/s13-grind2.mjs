// P05 Session 6b: friendly grind with world-tick-length waits.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
async function xp() {
  try { const snap = await s.ariaSnapshot(); const m = snap.match(/(\d+)\/100/); return m ? Number(m[1]) : -1; }
  catch { return -1; }
}
async function readyCampus() {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  for (let i = 0; i < 20; i++) {
    await s.page.waitForTimeout(2000);
    if (await s.page.getByRole('button', { name: 'PLAY' }).count()) break;
  }
  await dismissModals(s.page);
}

try {
  await readyCampus();
  console.log(`start XP=${await xp()}`);
  for (let i = 1; i <= 4; i++) {
    const before = await xp();
    const play = s.page.getByRole('button', { name: 'PLAY' });
    if (!(await play.count())) { console.log(`iter ${i}: no PLAY`); break; }
    await play.focus(); await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(4000);
    const pn = s.page.getByRole('button', { name: /Play now/ });
    if ((await pn.count()) && (await pn.first().isEnabled())) {
      await pn.first().focus(); await s.page.keyboard.press('Enter');
      console.log(`iter ${i}: played (before ${before})`);
    } else { console.log(`iter ${i}: Play now unavailable`); }
    await s.page.waitForTimeout(4000);
    const close = s.page.getByRole('button', { name: 'Close' });
    if (await close.count()) { await close.first().focus(); await s.page.keyboard.press('Enter'); }
    await s.page.waitForTimeout(150000); // one world tick
    await readyCampus();
    console.log(`iter ${i}: XP now ${await xp()} (world day advanced)`);
  }
  console.log(`shot=${await s.shot('43-grind2-final')}`);
  await s.decide(`Friendly grind with 150s tick waits finished; XP=${await xp()}/100.`);
} finally {
  await s.close();
}
