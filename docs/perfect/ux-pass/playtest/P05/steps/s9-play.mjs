// P05 Session 5: try PLAY from the campus (keyboard), to earn match XP.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, tabTo, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  await dismissModals(s.page);
  const head = (await s.ariaSnapshot()).split('\n').slice(0, 14).join('\n');
  console.log('=== CAMPUS TOP ==========================================');
  console.log(head);
  const p = await tabTo(s.page, /PLAY/i, 50);
  console.log(`tabTo PLAY -> ${JSON.stringify(p)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(5000);
  console.log(`url=${s.page.url()}`);
  console.log(`focus=${JSON.stringify(await activeInfo(s.page))}`);
  console.log(`shot=${await s.shot('38-play-open')}`);
  console.log('=== ARIA (first 60) ======================================');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 60).join('\n'));
  console.log('=== END ==================================================');
  await s.decide('Opened the PLAY flow from the campus with the keyboard.');
} finally {
  await s.close();
}
