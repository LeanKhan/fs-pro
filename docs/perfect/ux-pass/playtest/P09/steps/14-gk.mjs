// P09 step 14 — sign one GK; learn the player signing flow.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1000); }
  // Jump into the program via "Build a squad" first step, or Sign a manager; use whichever exists.
  const buildSquad = s.page.getByRole('button', { name: /Build a squad/ });
  if (await buildSquad.count()) { await buildSquad.click(); await s.page.waitForTimeout(2500); }
  else {
    await s.page.getByRole('button', { name: /Sign a manager/ }).click();
    await s.page.waitForTimeout(2000);
    const start = s.page.getByRole('button', { name: /start the program/ });
    if (await start.count()) { await start.click(); await s.page.waitForTimeout(2000); }
    await s.page.getByRole('tab', { name: /Squad/ }).click().catch(async () => {
      await s.page.getByText('Squad', { exact: true }).first().click();
    });
    await s.page.waitForTimeout(2000);
  }
  const gk = s.page.getByRole('button', { name: 'GK' });
  if (await gk.count()) { await gk.click(); await s.page.waitForTimeout(1200); }
  await s.shot('14-gk-filter');
  const sign = s.page.getByRole('button', { name: 'Sign' }).first();
  console.log('sign count:', await sign.count());
  await sign.click();
  await s.page.waitForTimeout(1500);
  await s.shot('14-after-player-sign-click');
  const aria = await s.ariaSnapshot();
  console.log('--- AFTER PLAYER SIGN CLICK (tail 40) ---');
  console.log(aria.split('\n').slice(-40).join('\n'));
  await s.decide('Filtered free agents to GK and tapped Sign on the first goalkeeper.');
} finally {
  await s.close();
}
console.log('DONE');
