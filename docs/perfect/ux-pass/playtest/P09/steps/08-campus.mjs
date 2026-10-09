// P09 step 08 — "Back to my club" -> campus; capture file for issue P09-01 too.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('08-start-again-wizard'); // evidence of P09-01
  const back = s.page.getByRole('button', { name: /Back to my club/ });
  console.log('Back button count:', await back.count());
  await back.click();
  await s.page.waitForTimeout(6000);
  console.log('URL:', s.page.url());
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step08-campus-aria.txt', aria);
  console.log('--- CAMPUS ARIA ---'); console.log(aria);
  await s.shot('08-campus');
  await s.decide('Used "Back to my club" to escape the re-opened founding wizard and reach the campus.');
} finally {
  await s.close();
}
console.log('DONE');
