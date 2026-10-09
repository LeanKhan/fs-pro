// P05 Session 6: grind qualifying friendlies; probe the Find a Match panel a11y.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
const xp = async () => {
  const snap = await s.ariaSnapshot();
  const m = snap.match(/(\d+)\/100/);
  return m ? Number(m[1]) : -1;
};

try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(9000);
  await dismissModals(s.page);
  console.log(`start XP=${await xp()}`);

  for (let i = 1; i <= 6; i++) {
    const before = await xp();
    const play = s.page.getByRole('button', { name: 'PLAY' });
    if (!(await play.count())) { console.log('no PLAY button'); break; }
    await play.focus();
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(4000);

    if (i === 1) {
      console.log(`FIND-A-MATCH: role=dialog ${await s.page.locator('[role="dialog"]').count()}, aria-modal ${await s.page.locator('[aria-modal="true"]').count()}, focus ${JSON.stringify(await activeInfo(s.page))}`);
      console.log(`shot=${await s.shot('41-find-match-panel')}`);
    }

    const pn = s.page.getByRole('button', { name: /Play now/ });
    const enabled = (await pn.count()) && (await pn.first().isEnabled());
    if (enabled) {
      await pn.first().focus();
      await s.page.keyboard.press('Enter');
      console.log(`iter ${i}: pressed Play now (XP before ${before})`);
    } else {
      console.log(`iter ${i}: Play now not enabled (cooldown?)`);
    }
    await s.page.waitForTimeout(5000);

    // Close the panel if it is still open.
    const close = s.page.getByRole('button', { name: 'Close' });
    if (await close.count()) { await close.first().focus(); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(1200); }

    await s.page.waitForTimeout(55000);
    await s.page.reload({ waitUntil: 'domcontentloaded' });
    await s.page.waitForTimeout(8000);
    await dismissModals(s.page);
    console.log(`iter ${i} done: XP now ${await xp()}`);
  }
  console.log(`shot=${await s.shot('42-grind-final')}`);
  await s.decide(`Grind loop finished; XP now ${await xp()}/100.`);
} finally {
  await s.close();
}
