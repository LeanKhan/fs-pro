// P10 step 14: interview a manager, then sign one.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
const PROG = 'http://localhost:4173/game/b7867e3f-f0de-4603-99d1-bfc44a1e5280/program';
try {
  await s.page.goto(PROG, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  console.log('url', s.page.url());
  await s.shot('14-manager-list');

  // Interview the first candidate.
  const interview = s.page.getByRole('button', { name: /Interview/ }).first();
  if (await interview.count()) {
    await interview.click();
    await s.page.waitForTimeout(2500);
    await s.shot('14b-interview');
    const a = await s.ariaSnapshot();
    dump('14b-interview', a);
    console.log('--- INTERVIEW ---');
    console.log(a.slice(0, 4000));
    await s.decide('Interviewed the first manager candidate.');
    // Try to close the interview (Esc or a close/OK button).
    const okay = s.page.getByRole('button', { name: /^(OK|Got it|Close|Done|Sign)$/ });
    if (await okay.count()) { await okay.first().click().catch(() => {}); }
    else { await s.page.keyboard.press('Escape').catch(() => {}); }
    await s.page.waitForTimeout(1500);
  }

  // Sign the first candidate.
  const sign = s.page.getByRole('button', { name: /^Sign$/ }).first();
  if (await sign.count()) {
    await s.shot('14c-before-sign');
    await sign.click();
    await s.page.waitForTimeout(3000);
    await s.shot('14d-after-sign');
    const a = await s.ariaSnapshot();
    dump('14d-after-sign', a);
    console.log('--- AFTER SIGN (url ' + s.page.url() + ') ---');
    console.log(a.slice(0, 5000));
    await s.decide('Signed the first manager candidate.');
  } else {
    console.log('no Sign button visible');
  }
} catch (e) {
  console.log('ERROR:', e && e.message);
  try { await s.shot('14-error'); } catch {}
} finally {
  await s.close();
  process.exit(0);
}
