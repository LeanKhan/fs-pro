// P03 step 32 — Play now, then verify whether the friendly registered (XP + played count).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const hud = async () => {
  const a = await s.ariaSnapshot();
  return (a.split('\n').find((l) => /\/100/.test(l)) || '').trim();
};
async function done() {
  await Promise.race([s.close().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]);
  process.exit(0);
}
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.first().click(); await s.page.waitForTimeout(800); }
  console.log('[HUD start]', await hud());

  await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  await s.page.getByRole('button', { name: 'Play now' }).first().click({ timeout: 15_000 });
  for (let i = 0; i < 6; i++) {
    await s.page.waitForTimeout(5000);
    console.log(`[t+${(i + 1) * 5}s]`, await hud());
  }
  await s.shot('32-after-playnow');
  console.log('URL:', s.page.url());
  console.log('===== SCREEN =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 45).join('\n'));

  // re-open owner program to read "friendlies played" + XP
  await s.page.getByRole('button', { name: /Owner's program/ }).first().click({ force: true, timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('32-op-after');
  console.log('===== OWNER PROGRAM AFTER =====');
  console.log((await s.ariaSnapshot()).split('\n').filter((l) => /XP|friendly|qualifying|Win |Draw|Loss|progress|budget|V\d/i.test(l)).slice(0, 25).join('\n'));
  await s.decide('Session 3: played a "Play now" friendly and re-checked the Owner program for XP.');
} catch (e) {
  await s.shot('32-error');
  await s.decide(`32 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
