import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
const signNext = async (label) => {
  const sign = s.page.getByRole('button', { name: 'Sign', exact: true }).first();
  await sign.scrollIntoViewIfNeeded().catch(() => {});
  await sign.click();
  await s.page.waitForTimeout(1200);
  const confirm = s.page.getByRole('button', { name: /Sign for V/i }).first();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
    await s.page.waitForTimeout(1600);
  } else {
    await s.page.waitForTimeout(600);
  }
  console.log('signed:', label);
};
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457/program', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  // Goalkeepers first.
  await s.page.getByRole('button', { name: 'GK', exact: true }).click();
  await s.page.waitForTimeout(1200);
  await s.page.getByRole('button', { name: 'Cheapest', exact: true }).click();
  await s.page.waitForTimeout(1200);
  await s.shot('14a-gk-list');
  await signNext('GK #1');
  await s.shot('14b-gk-signed');
  // Then outfield.
  await s.page.getByRole('button', { name: 'ALL', exact: true }).click();
  await s.page.waitForTimeout(1200);
  for (let i = 1; i <= 10; i++) {
    await signNext('outfield #' + i);
  }
  await s.page.waitForTimeout(1500);
  await s.shot('14c-squad-full');
  console.log('--- after signing ---');
  const snap = await s.ariaSnapshot();
  console.log(snap.split('\n').slice(0, 70).join('\n'));
  await s.decide('Signed 11 free agents (one goalkeeper + ten outfield) through the market. Eleven separate Sign -> confirm cycles with no batch option.');
} catch (e) {
  await s.shot('14-error');
  await s.decide('Blocked filling squad: ' + e.message);
} finally {
  await s.close();
}
