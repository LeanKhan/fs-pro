import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(9000);
  await s.shot('10a-campus-before-dismiss');
  console.log(await s.ariaSnapshot());
  for (const name of ["Let's go!", 'Got it']) {
    const b = s.page.getByRole('button', { name, exact: false });
    if (await b.isVisible().catch(() => false)) {
      console.log('dismissing:', name);
      await b.first().click().catch((e) => console.log('click err', name, e.message));
      await s.page.waitForTimeout(1500);
    }
  }
  await s.shot('10b-after-dismiss');
  await s.page.getByRole('button', { name: /Sign a manager/i }).first().click();
  await s.page.waitForTimeout(4500);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('10c-sign-manager');
  await s.decide('Dismissed welcome + advisor tips, then opened "Sign a manager". A full-screen modal blocks the page until dismissed.');
} catch (e) {
  await s.shot('10-error');
  await s.decide('Blocked opening Sign a manager: ' + e.message);
} finally {
  await s.close();
}
