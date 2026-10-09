// P05 Session 4: dismiss modals, open Owner's Program, sign a manager (keyboard only).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, tabTo, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const dismissed = await dismissModals(s.page);
  console.log(`dismissed overlays: ${dismissed}`);

  const owner = await tabTo(s.page, /Owner's program/i, 30);
  console.log(`owner chip: ${JSON.stringify(owner)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2500);

  // Start the program if the start button is present.
  if (await s.page.getByRole('button', { name: /start the program/i }).count()) {
    await tabTo(s.page, /start the program/i, 25);
    await s.page.keyboard.press('Enter');
  }
  await s.page.getByRole('searchbox', { name: /Search managers/i }).waitFor({ timeout: 120000 });
  await s.page.waitForTimeout(700);
  console.log(`program page: ${s.page.url()}`);
  console.log(`focus: ${JSON.stringify(await activeInfo(s.page))}`);

  const signAll = s.page.getByRole('button', { name: 'Sign this manager' });
  const intAll = s.page.getByRole('button', { name: 'Reveal the exact attributes' });
  console.log(`Sign buttons: ${await signAll.count()}; Interview buttons: ${await intAll.count()}`);
  console.log(`shot=${await s.shot('27-program-manager-open')}`);

  // Sign the FIRST manager via keyboard.
  const hit = await tabTo(s.page, /Sign this manager/, 30);
  console.log(`tabTo Sign -> ${JSON.stringify(hit)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(3500);
  console.log(`focus after sign: ${JSON.stringify(await activeInfo(s.page))}`);
  console.log(`shot=${await s.shot('28-after-sign-manager')}`);
  const snap = await s.ariaSnapshot();
  console.log('=== ARIA (first 70) ======================================');
  console.log(snap.split('\n').slice(0, 70).join('\n'));
  console.log('=== END ==================================================');
  await s.decide('Resume play: opened the Owner\'s Program and signed a manager with the keyboard.');
} finally {
  await s.close();
}
