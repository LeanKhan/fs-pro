// P03 step 34 — single-match diagnostic: poll PLAY state + XP every 5 s for 2 min.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const playLabel = async () => {
  const b = s.page.getByRole('button', { name: /^PLAY/ }).first();
  if (!(await b.count())) return '(none)';
  const en = await b.isEnabled().catch(() => '?');
  const t = (await b.innerText().catch(() => '')).replace(/\s+/g, ' ');
  return `[${t}] enabled=${en}`;
};
const hudLine = async () => ((await s.ariaSnapshot()).split('\n').find((l) => /\/100/.test(l)) || '').replace(/^- text: /, '').trim();
async function done() {
  await Promise.race([s.close().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]);
  process.exit(0);
}
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.first().click(); await s.page.waitForTimeout(800); }
  console.log('[start]', await hudLine(), '| PLAY', await playLabel());

  await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  console.log('[dialog open] Play now count:', await s.page.getByRole('button', { name: 'Play now' }).count());
  await s.shot('34-dialog');
  await s.page.getByRole('button', { name: 'Play now' }).first().click({ timeout: 15_000 });
  for (let i = 1; i <= 24; i++) {
    await s.page.waitForTimeout(5000);
    console.log(`[t+${i * 5}s]`, await hudLine(), '| PLAY', await playLabel());
    if (i === 3) await s.shot('34-t15');
    if (i === 6) await s.shot('34-t30');
    if (i === 12) await s.shot('34-t60');
  }
  await s.shot('34-t120');
  await s.decide('Session 4: single-match diagnostic with 2-min polling.');
} catch (e) {
  await s.shot('34-error');
  await s.decide(`34 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
