// P02 step 47: distinguish "The brief" tab vs "Squad" tab vs dock "Team Sheet".
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count()) { await letsGo.first().click().catch(() => {}); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: /^Manager$/ }).first().click().catch(() => {});
  await s.page.waitForTimeout(1200);
  const drawer = s.page.locator('aside.drawer');

  // The drawer tab "Squad" (scoped to the drawer nav).
  await drawer.getByRole('button', { name: 'Squad', exact: true }).first().click();
  await s.page.waitForTimeout(1800);
  await s.shot('47-drawer-squad');
  console.log('\n===== DRAWER TAB: Squad =====');
  console.log(await s.ariaSnapshot());

  // Close the drawer, then use the dock "Team Sheet" button.
  await drawer.getByRole('button', { name: 'Close' }).first().click().catch(async () => {
    await s.page.getByRole('button', { name: 'Close' }).first().click().catch(() => {});
  });
  await s.page.waitForTimeout(1000);
  await s.page.getByRole('button', { name: /^Team Sheet$/ }).first().click().catch((e) => console.log('team sheet fail', e.message));
  await s.page.waitForTimeout(2000);
  await s.shot('47-team-sheet');
  console.log('\n===== DOCK: Team Sheet =====');
  console.log(await s.ariaSnapshot());
  await s.decide('Compared "The brief" (tactics board) with the drawer "Squad" tab and the dock "Team Sheet" button to see whether they are the same screen with different names.');
} catch (e) {
  await s.shot('47-error');
  await s.decide(`Step 47 blocked: ${e.message}`);
} finally {
  await s.close();
}
