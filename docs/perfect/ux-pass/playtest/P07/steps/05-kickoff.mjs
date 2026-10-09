import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2000);
  // Make sure we're on the Club step (reload may land on Home).
  const clubName = s.page.getByLabel('Club name');
  if (!(await clubName.isVisible().catch(() => false))) {
    await s.page.getByRole('button', { name: 'Next: your club' }).click();
    await s.page.waitForTimeout(1500);
  }
  await clubName.fill('P07 Athletic');
  await s.page.getByLabel('Code', { exact: true }).fill('P07');
  await s.page.getByLabel('Ground (stadium name)').fill('P07 Park');
  await s.page.waitForTimeout(500);
  await s.shot('05a-club-filled', { fullPage: true });
  console.log('Next enabled?', await s.page.getByRole('button', { name: 'Next: kick-off' }).isEnabled());
  await s.page.getByRole('button', { name: 'Next: kick-off' }).click();
  await s.page.waitForTimeout(2500);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('05b-kickoff');
  await s.decide('Named club "P07 Athletic", code "P07", ground "P07 Park"; pressed Next: kick-off. "Code" was the least clear field - no hint what to type.');
} catch (e) {
  await s.shot('05-error');
  await s.decide('Blocked naming club: ' + e.message);
} finally {
  await s.close();
}
