import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(9000);
  // Dismiss comeback modal + advisor tip.
  for (const name of ["Let's go!", 'Got it']) {
    const b = s.page.getByRole('button', { name, exact: false });
    if (await b.isVisible().catch(() => false)) { await b.first().click().catch(() => {}); await s.page.waitForTimeout(1200); }
  }
  await s.shot('18a-campus-ready');
  await s.page.getByRole('button', { name: /^PLAY/ }).click();
  await s.page.waitForTimeout(4000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('18b-play-opened');
  await s.decide('Dismissed the comeback modal and pressed PLAY to find a qualifying friendly.');
} catch (e) {
  await s.shot('18-error');
  await s.decide('Blocked opening PLAY: ' + e.message);
} finally {
  await s.close();
}
