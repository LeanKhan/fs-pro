import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const gotIt = s.page.getByRole('button', { name: /Got it/i });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await s.page.waitForTimeout(1000);
  await s.page.getByRole('button', { name: /Sign a manager/i }).first().click();
  await s.page.waitForTimeout(4000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('10a-sign-manager');
  await s.decide('Started the first task: clicked "Sign a manager" in the First steps list.');
} catch (e) {
  await s.shot('10-error');
  await s.decide('Blocked opening Sign a manager: ' + e.message);
} finally {
  await s.close();
}
