// P01 resumed step 15 — play friendlies in a loop, capture each result, track XP.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const dismissAll = async () => {
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(500); }
  }
  const back = s.page.getByRole('button', { name: 'Back to the grounds' });
  if (await back.count()) { await back.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(700); }
};
const header = async () => {
  const t = await s.page.locator('body').innerText().catch(() => '');
  const m = t.match(/(\d+)\/100/);
  return m ? Number(m[1]) : -1;
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  await dismissAll();

  for (let m = 1; m <= 6; m++) {
    const xpBefore = await header();
    console.log(`--- match ${m}: XP before = ${xpBefore}`);
    const play = s.page.getByRole('button', { name: /PLAY/ }).first();
    if (!(await play.count())) { console.log('no PLAY'); break; }
    await play.click({ force: true });
    await s.page.waitForTimeout(1800);

    const now = s.page.getByText('Play now', { exact: true }).first();
    if (!(await now.count())) {
      console.log('no Play now (cooldown?)');
      console.log((await s.ariaSnapshot()).split('\n').slice(0, 40).join('\n'));
      await s.shot(`s02-20-match-${m}-noplay`);
      const close = s.page.getByRole('button', { name: 'Close' });
      if (await close.count()) { await close.first().click({ force: true }).catch(() => {}); }
      // wait for cooldown then retry
      await s.page.waitForTimeout(80000);
      m--; // retry same slot
      continue;
    }
    await now.click({ force: true });
    await s.page.waitForTimeout(5000);
    console.log(`=== match ${m} result a11y ===`);
    console.log(await s.ariaSnapshot());
    await s.shot(`s02-21-match-${m}-result`);
    await dismissAll();
    const xpAfter = await header();
    console.log(`--- match ${m}: XP after = ${xpAfter}`);
    if (xpAfter >= 100) { console.log('LEVEL 1 XP REACHED OR PASSED'); break; }
    // cooldown between matches (design 300s => 75s at scale 4)
    await s.page.waitForTimeout(78000);
    await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await s.page.waitForTimeout(2500);
    await dismissAll();
  }
  await s.decide('Played a run of qualifying friendlies, capturing each result and XP.');
} catch (e) {
  await s.shot('s02-error15');
  await s.decide(`Blocked match loop: ${e.message}`);
} finally {
  await s.close();
}
