import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457/program', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  await s.shot('11a-program');
  await s.page.getByRole('button', { name: /start the program/i }).click();
  await s.page.waitForTimeout(4500);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('11b-manager-market');
  await s.decide('Pressed "Right then — start the program" to reach the manager hiring screen.');
} catch (e) {
  await s.shot('11-error');
  await s.decide('Blocked starting owner program: ' + e.message);
} finally {
  await s.close();
}
