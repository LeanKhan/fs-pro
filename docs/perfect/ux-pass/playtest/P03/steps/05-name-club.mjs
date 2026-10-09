// P03 step 05 — name the club and advance to kick-off.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1200);
  // If we're not on the club step (fresh reload may reset), navigate via buttons.
  if (!(await s.page.getByRole('button', { name: 'Next: kick-off' }).count())) {
    await s.page.getByRole('button', { name: 'Next: your club' }).click();
    await s.page.waitForTimeout(1000);
  }
  await s.page.getByRole('textbox', { name: 'Club name' }).fill('Ledger United');
  await s.page.getByRole('textbox', { name: 'Code' }).fill('LED');
  await s.page.getByRole('textbox', { name: 'Ground (stadium name)' }).fill('Balance Park');
  await s.page.waitForTimeout(500);
  await s.shot('05-club-filled');
  const next = s.page.getByRole('button', { name: 'Next: kick-off' });
  console.log('[next disabled?]', await next.isDisabled());
  await next.click();
  await s.page.waitForTimeout(1500);
  await s.shot('05-kickoff-step');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide('Named club Ledger United (LED), ground Balance Park; advanced.');
} catch (e) {
  await s.shot('05-error');
  await s.decide(`Blocked naming club: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
