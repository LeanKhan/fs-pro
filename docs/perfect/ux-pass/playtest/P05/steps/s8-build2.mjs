// P05 Session 4i: build the Tier 1 Training Ground and read the result.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  await dismissModals(s.page);
  const owner = s.page.getByRole('button', { name: /Owner's program/i }).first();
  await owner.focus();
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2500);
  const build = s.page.getByRole('button', { name: 'Build Tier 1' }).first();
  await build.waitFor({ timeout: 120000 });
  console.log(`Build buttons: ${await s.page.getByRole('button', { name: 'Build Tier 1' }).count()}`);
  await build.focus();
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2000);
  console.log(`focus after build: ${JSON.stringify(await activeInfo(s.page))}`);
  console.log(`dialogs: ${await s.page.getByRole('dialog').count()}`);
  if (await s.page.getByRole('dialog').count()) {
    console.log(await s.page.getByRole('dialog').first().ariaSnapshot());
    const c = s.page.getByRole('button', { name: /Build|Confirm|Start/i }).last();
    if (await c.count()) { await c.focus(); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(3500); }
  }
  console.log(`shot=${await s.shot('37-facility-built')}`);
  console.log('=== ARIA (first 22) ======================================');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 22).join('\n'));
  console.log('=== END ==================================================');
  await s.decide('Built the Tier 1 Training Ground from the Owner\'s Program (keyboard).');
} finally {
  await s.close();
}
