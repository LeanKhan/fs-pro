// P05 Session 4d: build the matchday squad — 1 GK + 10 outfield via keyboard.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, tabTo, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');

async function signFirst(tag) {
  const sign = s.page.getByRole('button', { name: 'Sign', exact: true }).first();
  if ((await sign.count()) === 0) { console.log(`  [${tag}] no Sign button left`); return false; }
  await sign.focus();
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(1600);
  const sf = s.page.getByRole('button', { name: /Sign for V/i }).first();
  if ((await sf.count()) === 0) { console.log(`  [${tag}] signed with no dialog`); return true; }
  await sf.focus();
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2200);
  return true;
}

try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  await dismissModals(s.page);
  await tabTo(s.page, /Owner's program/i, 30);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2500);
  if (await s.page.getByRole('button', { name: /start the program/i }).count()) {
    await tabTo(s.page, /start the program/i, 25);
    await s.page.keyboard.press('Enter');
  }
  await s.page.getByRole('tab', { name: 'Free agents' }).waitFor({ timeout: 120000 });
  await s.page.waitForTimeout(600);
  console.log(`squad screen. focus=${JSON.stringify(await activeInfo(s.page))}`);

  // Keeper first.
  const gk = await tabTo(s.page, /^GK$/, 40);
  console.log(`GK filter tab -> ${JSON.stringify(gk)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(1200);
  console.log(`keeper sign: ${await signFirst('GK')}`);
  console.log(`shot=${await s.shot('32-squad-gk-signed')}`);

  // Then the outfielders.
  const all = await tabTo(s.page, /^ALL$/, 40);
  console.log(`ALL filter tab -> ${JSON.stringify(all)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(1200);
  let ok = 0;
  for (let i = 0; i < 12 && ok < 10; i++) {
    if (await signFirst(`OF${i + 1}`)) ok++;
    else break;
  }
  console.log(`outfielders signed: ${ok}`);
  await s.page.waitForTimeout(1500);
  console.log(`focus=${JSON.stringify(await activeInfo(s.page))}`);
  console.log(`shot=${await s.shot('33-squad-built')}`);
  const snap = await s.ariaSnapshot();
  console.log('=== ARIA (first 26) ======================================');
  console.log(snap.split('\n').slice(0, 26).join('\n'));
  console.log('=== END ==================================================');
  await s.decide(`Squad step: signed 1 GK + ${ok} outfielders using the focus workaround for each negotiate dialog.`);
} finally {
  await s.close();
}
