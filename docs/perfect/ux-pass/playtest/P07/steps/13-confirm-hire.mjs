import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457/program', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  await s.page.getByRole('button', { name: 'Sign', exact: true }).first().click();
  await s.page.waitForTimeout(2500);
  await s.shot('13a-modal');
  console.log('--- modal aria ---');
  console.log(await s.ariaSnapshot());
  await s.page.getByRole('button', { name: /Sign for V/i }).click();
  await s.page.waitForTimeout(3500);
  await s.shot('13b-after-hire');
  console.log('--- after hire ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Confirmed "Sign for V40,000" in the Negotiate & sign modal and hired the manager.');
} catch (e) {
  await s.shot('13-error');
  await s.decide('Blocked confirming manager hire: ' + e.message);
} finally {
  await s.close();
}
