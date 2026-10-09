// P10 step 15: complete the manager signing via the Negotiate & sign modal.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
const PROG = 'http://localhost:4173/game/b7867e3f-f0de-4603-99d1-bfc44a1e5280/program';
try {
  await s.page.goto(PROG, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  // Open the negotiate modal for the first candidate.
  await s.page.getByRole('button', { name: /^Sign$/ }).first().click({ force: true });
  await s.page.waitForTimeout(1500);
  await s.shot('15-negotiate');
  // Contract length 5 then sign.
  const five = s.page.getByRole('button', { name: '5', exact: true });
  if (await five.count()) { await five.first().click(); await s.page.waitForTimeout(400); await s.shot('15b-contract5'); }
  const confirm = s.page.getByRole('button', { name: /Sign for V/ });
  console.log('confirm count', await confirm.count());
  await confirm.first().click();
  await s.page.waitForTimeout(4000);
  await s.shot('15c-after-hire');
  const a = await s.ariaSnapshot();
  dump('15c-after-hire', a);
  console.log('=== URL ===', s.page.url());
  console.log(a.slice(0, 3500));
  await s.decide('Signed manager Jousare Batou on a 5-year contract from the Negotiate & sign modal.');
} catch (e) {
  console.log('ERROR:', e && e.message);
  try { await s.shot('15-error'); } catch {}
} finally {
  await s.close();
  process.exit(0);
}
