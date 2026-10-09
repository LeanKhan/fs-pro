// P05 Session 5b: play a match from the Find a Match panel.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, tabTo, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  await dismissModals(s.page);
  const p = await tabTo(s.page, /PLAY/i, 50);
  console.log(`PLAY tab -> ${JSON.stringify(p)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(4000);
  const play = await tabTo(s.page, /Play now/i, 20);
  console.log(`Play now tab -> ${JSON.stringify(play)}`);
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(6000);
  console.log(`url=${s.page.url()} focus=${JSON.stringify(await activeInfo(s.page))}`);
  console.log(`shot=${await s.shot('39-match-start')}`);
  console.log('=== ARIA (first 55) ======================================');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 55).join('\n'));
  console.log('=== END ==================================================');
  await s.decide('Pressed "Play now" from Find a Match; capturing the match/pending state.');
} finally {
  await s.close();
}
