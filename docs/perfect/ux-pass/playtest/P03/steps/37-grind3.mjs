// P03 step 37 — grind with Matchzone/error overlay recovery (Back / Result / Escape).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const N = Number(process.argv[2] || 4);
const hud = async () => {
  const a = await s.ariaSnapshot();
  const m = a.match(/(\d+)\s+(\d+\/\d+)\s+V([\d.]+M)\s+(\d+)\s+(\d+)\s+(\d+)/);
  const rank = (a.match(/(\d+)\s+(\d+(?:st|nd|rd|th)\/\d+)/) || [])[0] || '';
  return m ? `L${m[1]} xp=${m[2]} bal=V${m[3]} fans=${m[4]} star=${m[5]} pwr=${m[6]} ${rank}`.trim() : '(no-hud)';
};
const playLabel = async () => {
  const b = s.page.getByRole('button', { name: /^PLAY/ }).first();
  if (!(await b.count())) return '(none)';
  return (await b.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
};
let sawError = false;
async function clearOverlay() {
  const a = await s.ariaSnapshot();
  if (/Error fetching match replay/.test(a) && !sawError) {
    sawError = true;
    await s.shot('37-replay-error');
    console.log('[!] "Error fetching match replay" overlay seen');
    console.log(a.split('\n').slice(0, 25).join('\n'));
  }
  for (const name of [/^Back$/, /^Result/, /^Continue$/, /^Close$/]) {
    const b = s.page.getByRole('button', { name });
    if (await b.count()) {
      await b.first().click({ timeout: 8000 }).catch(() => {});
      await s.page.waitForTimeout(1500);
      return String(name);
    }
  }
  return null;
}
async function waitReady(max = 170000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    await clearOverlay();
    const t = await playLabel();
    if (/Ready/.test(t) && !/Resting|Playing/.test(t)) return true;
    await s.page.waitForTimeout(2500);
  }
  return false;
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
  await clearOverlay();
  console.log('[start]', await hud());

  for (let i = 1; i <= N; i++) {
    if (!(await waitReady())) { console.log(`[m${i}] not ready`); break; }
    await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 15_000 });
    await s.page.waitForTimeout(2500);
    const pn = s.page.getByRole('button', { name: 'Play now' });
    if (!(await pn.count())) { console.log(`[m${i}] no dialog`); break; }
    const b = await hud();
    await pn.first().click({ timeout: 15_000 });
    let doneMatch = false, closed = null;
    for (let k = 0; k < 30; k++) {
      await s.page.waitForTimeout(3500);
      closed = (await clearOverlay()) || closed;
      const t = await playLabel();
      if (/Resting/.test(t)) { doneMatch = true; break; }
      if (/Ready/.test(t) && k >= 3) { doneMatch = true; break; }
      if (k === 3) await s.shot(`37-m${i}-mid`);
    }
    const a = await hud();
    console.log(`[m${i}] before: ${b}`);
    console.log(`[m${i}] after : ${a} closed=${closed} done=${doneMatch}`);
    await s.shot(`37-m${i}-after`);
  }
  await s.shot('37-end');
  console.log('[end]', await hud());
  await s.decide(`Session 4c: ground friendlies with overlay recovery; end ${await hud()}.`);
} catch (e) {
  await s.shot('37-error');
  await s.decide(`37 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
