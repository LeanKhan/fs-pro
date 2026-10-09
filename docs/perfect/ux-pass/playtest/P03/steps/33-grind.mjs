// P03 step 33 — grind qualifying friendlies; log XP delta + cooldown each time.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const N = Number(process.argv[2] || 5);
const hudLine = async () => ((await s.ariaSnapshot()).split('\n').find((l) => /\/100/.test(l)) || '').trim();
async function waitPlayEnabled(max = 150000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const b = s.page.getByRole('button', { name: /^PLAY/ }).first();
    if ((await b.count()) && (await b.isEnabled().catch(() => false))) return true;
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
  console.log('[start]', await hudLine());

  for (let i = 1; i <= N; i++) {
    const ok = await waitPlayEnabled();
    if (!ok) { console.log(`[match ${i}] PLAY never enabled; stop`); break; }
    await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 15_000 });
    await s.page.waitForTimeout(2500);
    const pn = s.page.getByRole('button', { name: 'Play now' });
    if (!(await pn.count())) { console.log(`[match ${i}] no Play now (dialog?); stop`); break; }
    const before = await hudLine();
    await pn.first().click({ timeout: 15_000 });
    await s.page.waitForTimeout(28000);
    const after = await hudLine();
    console.log(`[match ${i}] before: ${before.replace(/^- text: /, '')}`);
    console.log(`[match ${i}] after : ${after.replace(/^- text: /, '')}`);
    await s.shot(`33-match-${i}`);
    // ensure we are back on campus (close any lingering dialog)
    const close = s.page.getByRole('button', { name: 'Close' });
    if (await close.count()) { await close.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(800); }
  }
  await s.shot('33-after-grind');
  console.log('[end]', await hudLine());
  // read the Owner program for the level progress
  const op = s.page.getByRole('button', { name: /Owner's program/ });
  if (await op.count()) {
    await op.first().click({ force: true, timeout: 15_000 });
    await s.page.waitForTimeout(2500);
    await s.shot('33-op-after-grind');
    console.log('===== OP =====');
    console.log((await s.ariaSnapshot()).split('\n').filter((l) => /XP|Level 1|progress|V\d|league|League|friendly|Win |Draw|Loss|advance/i.test(l)).slice(0, 30).join('\n'));
  }
  await s.decide(`Session 4: ground multiple qualifying friendlies; XP end ${(await hudLine()).replace(/^- text: /, '')}.`);
} catch (e) {
  await s.shot('33-error');
  await s.decide(`33 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
