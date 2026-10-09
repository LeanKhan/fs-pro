// P03 step 36 — robust grind: play N qualifying friendlies, handle Matchzone + Resting.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const N = Number(process.argv[2] || 4);
const hud = async () => {
  const a = await s.ariaSnapshot();
  const m = a.match(/(\d+)\s+(\d+\/\d+)\s+V([\d.]+M)\s+(\d+)\s+(\d+)\s+(\d+)/);
  const rank = (a.match(/(\d+)\s+(\d+(?:st|nd|rd|th)\/\d+)/) || [])[0] || '';
  return m ? `L${m[1]} xp=${m[2]} bal=V${m[3]} fans=${m[4]} star=${m[5]} pwr=${m[6]} ${rank}`.trim() : '(hud?)';
};
const playLabel = async () => {
  const b = s.page.getByRole('button', { name: /^PLAY/ }).first();
  if (!(await b.count())) return '(none)';
  return (await b.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
};
async function waitReady(max = 160000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const t = await playLabel();
    if (/Ready/.test(t) && !/Resting|Playing/.test(t)) return true;
    await s.page.waitForTimeout(2500);
  }
  return false;
}
async function passMatchzone() {
  const res = s.page.getByRole('button', { name: /Result/ });
  if (await res.count()) { await res.first().click({ timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1500); }
}
async function done() {
  await Promise.race([s.close().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]);
  process.exit(0);
}
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.first().click(); await s.page.waitForTimeout(800); }
  console.log('[start]', await hud());

  for (let i = 1; i <= N; i++) {
    if (!(await waitReady())) { console.log(`[m${i}] PLAY never ready`); break; }
    await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 15_000 });
    await s.page.waitForTimeout(2500);
    const opp = s.page.getByRole('button', { name: 'Play now' });
    if (!(await opp.count())) { console.log(`[m${i}] no dialog`); break; }
    const oppName = (await s.ariaSnapshot()).split('\n').filter((l) => /Power|Even|Challenger|Favou/i.test(l)).slice(0, 3).join(' | ');
    const b = await hud();
    await opp.first().click({ timeout: 15_000 });
    // wait for match to finish: PLAY enters Resting, or Matchzone appears
    let rested = false;
    for (let k = 0; k < 32; k++) {
      await s.page.waitForTimeout(3000);
      const t = await playLabel();
      if (/Result/.test((await s.ariaSnapshot()).slice(0, 4000)) && k >= 2) await passMatchzone();
      if (/Resting/.test(t)) { rested = true; break; }
      if (k === 4) await s.shot(`36-m${i}-live`);
    }
    if (!rested) await passMatchzone();
    const a = await hud();
    console.log(`[m${i}] opp: ${oppName.replace(/^- /g, '')}`);
    console.log(`[m${i}] before: ${b}`);
    console.log(`[m${i}] after : ${a}  rested=${rested}`);
    await s.shot(`36-m${i}-after`);
    if (i < N) { const ok = await waitReady(); if (!ok) console.log(`[m${i}] not ready for next`); }
  }
  await s.shot('36-end');
  console.log('[end]', await hud());
  await s.decide(`Session 4b: ground friendlies; end ${await hud()}.`);
} catch (e) {
  await s.shot('36-error');
  await s.decide(`36 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
