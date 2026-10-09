// P05 Session 4g: build the Tier 1 Training Ground (a11y name is "Start the build").
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
  await s.page.getByRole('button', { name: 'Start the build' }).first().waitFor({ timeout: 120000 });
  await s.page.waitForTimeout(700);

  const hit = await tabTo(s.page, /Start the build/, 40);
  console.log(`tabTo first Start-the-build -> ${JSON.stringify(hit)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2000);
  console.log(`focus after build: ${JSON.stringify(await activeInfo(s.page))}`);
  const dlg = s.page.getByRole('dialog');
  console.log(`dialogs: ${await dlg.count()}`);
  if (await dlg.count()) {
    console.log(await dlg.first().ariaSnapshot());
    const confirm = s.page.getByRole('button', { name: /Build|Confirm|Start/i }).last();
    if (await confirm.count()) { await confirm.focus(); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(3000); }
  }
  console.log(`shot=${await s.shot('36-training-ground-build')}`);
  const snap = await s.ariaSnapshot();
  console.log('=== ARIA (first 22) ======================================');
  console.log(snap.split('\n').slice(0, 22).join('\n'));
  console.log('=== END ==================================================');
  await s.decide('Built the Tier 1 Training Ground (button is named "Start the build").');
} finally {
  await s.close();
}
