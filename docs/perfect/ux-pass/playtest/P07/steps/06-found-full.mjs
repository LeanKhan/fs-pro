import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  await s.page.getByRole('button', { name: 'Next: your club' }).click();
  await s.page.waitForTimeout(1500);
  await s.page.getByLabel('Club name').fill('P07 Athletic');
  await s.page.getByLabel('Code', { exact: true }).fill('P07');
  await s.page.getByLabel('Ground (stadium name)').fill('P07 Park');
  await s.page.waitForTimeout(500);
  await s.page.getByRole('button', { name: 'Next: kick-off' }).click();
  await s.page.waitForTimeout(2000);
  await s.shot('06a-kickoff-ready');
  await s.page.getByRole('button', { name: 'Found P07 Athletic' }).click();
  await s.page.waitForTimeout(9000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('06b-campus');
  await s.decide('Completed founding in one pass and pressed Found. Wizard resets to step 1 if the page reloads - a refresh mid-founding loses your club name and crest.');
} catch (e) {
  await s.shot('06-error');
  await s.decide('Blocked founding club: ' + e.message);
} finally {
  await s.close();
}
