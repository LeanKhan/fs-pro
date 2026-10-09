import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(9000);
  for (const name of ["Let's go!", 'Got it']) {
    const b = s.page.getByRole('button', { name, exact: false });
    if (await b.isVisible().catch(() => false)) { await b.first().click().catch(() => {}); await s.page.waitForTimeout(1000); }
  }
  await s.page.getByRole('button', { name: /^PLAY/ }).click();
  await s.page.waitForTimeout(3000);
  await s.page.getByRole('button', { name: 'Play now', exact: true }).click();
  await s.page.waitForTimeout(25000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('19a-match-result');
  await s.decide('Pressed "Play now" to play a qualifying friendly; waited for the result.');
} catch (e) {
  await s.shot('19-error');
  await s.decide('Blocked playing a match: ' + e.message);
} finally {
  await s.close();
}
