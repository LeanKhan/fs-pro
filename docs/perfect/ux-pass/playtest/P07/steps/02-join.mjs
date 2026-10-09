import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1500);
  await s.shot('02a-before-join');
  // Click the "New manager" option that is visible on the landing page.
  await s.page.getByRole('link', { name: 'New manager' }).click();
  await s.page.waitForTimeout(2500);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('02b-join-form');
  await s.decide('Clicked "New manager" to register. Chose it over "Sign in" because I have no account.');
} catch (e) {
  await s.shot('02-error');
  await s.decide('Blocked at registration step: ' + e.message);
} finally {
  await s.close();
}
