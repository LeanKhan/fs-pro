// P05 Session 4h: diagnose the Owner's Program state after the squad step.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, tabTo, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const d = await dismissModals(s.page);
  console.log(`dismissed: ${d}; url=${s.page.url()}`);
  console.log('=== CAMPUS ARIA (first 30) ===============================');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 30).join('\n'));
  const owner = await tabTo(s.page, /Owner's program/i, 30);
  console.log(`owner chip -> ${JSON.stringify(owner)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(3500);
  console.log(`url after open: ${s.page.url()}`);
  console.log('=== PROGRAM ARIA (first 34) ==============================');
  const snap = await s.ariaSnapshot();
  console.log(snap.split('\n').slice(0, 34).join('\n'));
  console.log(`shot=${await s.shot('36b-program-state')}`);
  await s.decide('Diagnosed the program step state before building the facility.');
} finally {
  await s.close();
}
