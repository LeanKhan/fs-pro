// P05 Session 4c: work around the unreachable dialog buttons, complete the sign,
// then inspect the next program step. Workaround is logged in the diary.
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

  await tabTo(s.page, /Sign this manager/, 30);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2500);

  // WORKAROUND (logged): the dialog's buttons are last in a 200-card document,
  // so a keyboard user cannot reach them; place focus then use the keyboard.
  const signFor = s.page.getByRole('button', { name: /Sign for V/i }).first();
  console.log(`Sign-for present: ${await signFor.count()}`);
  await signFor.focus();
  console.log(`focus now: ${JSON.stringify(await activeInfo(s.page))}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(5000);
  console.log(`focus after confirm: ${JSON.stringify(await activeInfo(s.page))}`);
  console.log(`shot=${await s.shot('31-manager-signed')}`);

  const snap = await s.ariaSnapshot();
  console.log('=== ARIA (first 40) ======================================');
  console.log(snap.split('\n').slice(0, 40).join('\n'));
  console.log('=== END ==================================================');
  await s.decide('WORKAROUND: placed focus on the negotiate dialog button to finish signing (keyboard alone could not reach it).');
} finally {
  await s.close();
}
