// P08 step 05 — name club + code + ground, proceed to kick-off.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1500);
  if (await s.page.getByRole('button', { name: 'Next: your club' }).count()) {
    await s.page.getByRole('button', { name: 'Next: your club' }).click();
    await s.page.waitForTimeout(1200);
  }
  const inputs = s.page.locator('input[type="text"], input:not([type])');
  // Club name, Code, Ground are the first three text inputs in the panel.
  const nameBox = s.page.getByRole('textbox', { name: 'Club name' });
  const codeBox = s.page.getByRole('textbox', { name: 'Code' });
  const groundBox = s.page.getByRole('textbox', { name: 'Ground (stadium name)' });
  await nameBox.fill('Invite Rovers');
  await codeBox.fill('INV');
  await groundBox.fill('Invite Park');
  await s.page.waitForTimeout(500);
  await s.shot('05-club-filled');
  await s.page.getByRole('button', { name: 'Next: kick-off' }).click();
  await s.page.waitForTimeout(2000);
  console.log('URL:', s.page.url());
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.shot('05-kickoff');
  await s.decide('Named club "Invite Rovers" (INV), ground "Invite Park"; advanced to kick-off.');
} catch (e) {
  await s.shot('05-club-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
