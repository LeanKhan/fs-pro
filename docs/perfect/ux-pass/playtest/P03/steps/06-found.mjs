// P03 step 06 — found the club, land on campus.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1200);
  if (await s.page.getByRole('button', { name: 'Found Ledger United' }).count()) {
    await s.page.getByRole('button', { name: 'Found Ledger United' }).click();
  } else {
    // walk the steps
    await s.page.getByRole('button', { name: 'Next: your club' }).click();
    await s.page.waitForTimeout(800);
    await s.page.getByRole('textbox', { name: 'Club name' }).fill('Ledger United');
    await s.page.getByRole('textbox', { name: 'Code' }).fill('LED');
    await s.page.getByRole('textbox', { name: 'Ground (stadium name)' }).fill('Balance Park');
    await s.page.getByRole('button', { name: 'Next: kick-off' }).click();
    await s.page.waitForTimeout(800);
    await s.page.getByRole('button', { name: 'Found Ledger United' }).click();
  }
  await s.page.waitForTimeout(5000);
  console.log('[url]', s.page.url());
  await s.shot('06-after-found');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide(`Founded Ledger United; landed on ${s.page.url()}.`);
} catch (e) {
  await s.shot('06-error');
  await s.decide(`Blocked founding club: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
