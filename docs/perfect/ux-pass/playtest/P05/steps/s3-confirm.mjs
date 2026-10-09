// P05 Session 4b: probe the "Negotiate & sign" dialog semantics, then sign.
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
  await s.page.getByRole('searchbox', { name: /Search managers/i }).waitFor({ timeout: 120000 });
  await s.page.waitForTimeout(600);

  const hit = await tabTo(s.page, /Sign this manager/, 30);
  console.log(`tabTo Sign -> ${JSON.stringify(hit)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2500);

  console.log(`dialog els: ${await s.page.locator('[role="dialog"],[role="alertdialog"]').count()}`);
  console.log(`aria-modal els: ${await s.page.locator('[aria-modal="true"]').count()}`);
  console.log(`focus (behind dialog?): ${JSON.stringify(await activeInfo(s.page))}`);
  console.log(`shot=${await s.shot('29-negotiate-dialog')}`);

  const snap = await s.ariaSnapshot();
  console.log('=== ARIA TAIL (last 25 lines) ============================');
  console.log(snap.split('\n').slice(-25).join('\n'));
  console.log('=== END ==================================================');

  const go = await tabTo(s.page, /Sign for V/i, 40);
  console.log(`tabTo Sign-for -> ${JSON.stringify(go)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(4000);
  console.log(`focus after confirm: ${JSON.stringify(await activeInfo(s.page))}`);
  console.log(`shot=${await s.shot('30-manager-signed')}`);
  const snap2 = await s.ariaSnapshot();
  console.log('=== ARIA HEAD (first 12) ================================');
  console.log(snap2.split('\n').slice(0, 12).join('\n'));
  console.log('=== END ==================================================');
  await s.decide('Negotiate & sign dialog: no dialog role, focus left behind, and it renders last in the a11y tree; completed the sign by keyboard.');
} finally {
  await s.close();
}
