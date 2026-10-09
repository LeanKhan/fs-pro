import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(9000);
  // Dismiss the first-run welcome modal if present.
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.isVisible().catch(() => false)) {
    await letsGo.click();
    await s.page.waitForTimeout(2500);
  }
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('09a-after-letsgo');
  await s.decide('Dismissed the first-run welcome with "Let\'s go!" and looked at the campus chrome and First steps panel.');
} catch (e) {
  await s.shot('09-error');
  await s.decide('Blocked on campus after welcome: ' + e.message);
} finally {
  await s.close();
}
