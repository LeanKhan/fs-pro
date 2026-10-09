// P08 step 20 — capture Account route + full page at 390px.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
async function dismiss(s) {
  for (let i = 0; i < 5; i++) {
    const c = s.page.getByRole('button', { name: 'Close' });
    if (await c.count() === 0) break;
    if (!(await c.first().isVisible().catch(() => false))) break;
    await c.first().click({ timeout: 4000 }).catch(() => {});
    await s.page.waitForTimeout(700);
  }
}
const s = await personaContext('P08');
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  await dismiss(s);
  await s.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('button', { name: /Account/ }).click();
  await s.page.waitForTimeout(3000);
  console.log('URL:', s.page.url());
  await s.shot('20-account-full', { fullPage: true });
  await s.shot('20-account-vp');
  // Look for any way to close the sidebar
  const btns = await s.page.getByRole('button').allTextContents();
  console.log('buttons:', JSON.stringify(btns));
  await s.decide('Captured the Account screen at 390x844 (full page + viewport): the nav sidebar overlays the account form.');
} catch (e) {
  await s.shot('20-account-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
