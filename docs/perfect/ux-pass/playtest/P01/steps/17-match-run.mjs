// P01 resumed step 17 — efficient friendly loop toward Level 2 (400 XP).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const dismissAll = async () => {
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(400); }
  }
  const back = s.page.getByRole('button', { name: 'Back to the grounds' });
  if (await back.count()) { await back.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(500); }
};
const getXp = async () => {
  const t = await s.page.locator('body').innerText().catch(() => '');
  const m = t.match(/(\d+)\/100/);
  return m ? Number(m[1]) : -1;
};
const playOne = async () => {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  await dismissAll();
  const play = s.page.getByRole('button', { name: /PLAY/ }).first();
  if (!(await play.count())) return { status: 'noplay' };
  await play.click({ force: true });
  await s.page.waitForTimeout(1500);
  const now = s.page.getByText('Play now', { exact: true }).first();
  if (await now.count()) {
    await now.click({ force: true });
    await s.page.waitForTimeout(4000);
    return { status: 'played' };
  }
  return { status: 'cooldown' };
};
try {
  let xp = await getXp();
  console.log('start XP:', xp);
  let matches = 0;
  for (let i = 0; i < 60 && xp < 400; i++) {
    const r = await playOne();
    if (r.status === 'played') {
      matches++;
      const before = xp;
      await s.page.waitForTimeout(2500);
      xp = await getXp();
      console.log(`match ${matches}: XP ${before} -> ${xp}`);
      await s.shot(`s02-24-run-${matches}`);
    } else {
      console.log(`i=${i} ${r.status}; waiting`);
      await s.page.waitForTimeout(12000);
    }
  }
  console.log('FINAL XP:', xp, 'matches played:', matches);
  await s.shot('s02-25-run-final');
  await s.decide(`Ran friendlies to push club XP to ${xp}/100 (matches this run: ${matches}).`);
} catch (e) {
  await s.shot('s02-error17');
  await s.decide(`Match run stopped: ${e.message}`);
} finally {
  await s.close();
}
