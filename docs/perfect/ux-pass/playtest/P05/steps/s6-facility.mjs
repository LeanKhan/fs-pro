// P05 Session 4e: build a Tier 1 Training Ground (keyboard).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, tabTo, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
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
  await s.page.getByRole('button', { name: 'Build Tier 1' }).first().waitFor({ timeout: 120000 });
  await s.page.waitForTimeout(700);

  const hit = await tabTo(s.page, /Build Tier 1/, 40);
  console.log(`tabTo Build Tier 1 -> ${JSON.stringify(hit)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(1800);
  console.log(`focus after build: ${JSON.stringify(await activeInfo(s.page))}`);

  // Any confirmation dialog?
  const dlg = s.page.getByRole('dialog');
  if (await dlg.count()) {
    const tail = await dlg.first().ariaSnapshot();
    console.log(`dialog content:\n${tail}`);
    const confirm = s.page.getByRole('button', { name: /^Build|Confirm|Start building|Build Tier 1$/i }).last();
    if (await confirm.count()) { await confirm.focus(); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(2500); }
  }
  console.log(`shot=${await s.shot('34-facility-built')}`);
  const snap = await s.ariaSnapshot();
  console.log('=== ARIA (first 24) ======================================');
  console.log(snap.split('\n').slice(0, 24).join('\n'));
  console.log('=== END ==================================================');
  await s.decide('Facilities step: started a Tier 1 Training Ground build from the Owner\'s Program.');
} finally {
  await s.close();
}
