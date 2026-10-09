import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457/program', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  await s.shot('12a-market');
  // Hire the first (cheapest) manager offered.
  await s.page.getByRole('button', { name: 'Sign', exact: true }).first().click();
  await s.page.waitForTimeout(2500);
  await s.shot('12b-after-sign-click');
  console.log('--- after Sign click ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Clicked "Sign" on the cheapest manager. It cost a V40,000 fee and showed an interview price of V25,000 that I did not have to pay - the two buttons are confusing next to each other.');
} catch (e) {
  await s.shot('12-error');
  await s.decide('Blocked signing a manager: ' + e.message);
} finally {
  await s.close();
}
