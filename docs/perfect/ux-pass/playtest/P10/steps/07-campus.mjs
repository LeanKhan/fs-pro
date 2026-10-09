// P10 step 07: enter the ground (campus), capture the first full campus view.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  console.log('url after goto', s.page.url());
  // If the "born" panel is showing, click through.
  const goBtn = s.page.getByRole('button', { name: /Go to your ground/ });
  if (await goBtn.count()) {
    await goBtn.click();
    await s.page.waitForTimeout(5000);
  }
  await s.shot('07-campus');
  await s.shot('07-campus-full', { fullPage: true });
  const aria = await s.ariaSnapshot();
  dump('07-campus', aria);
  console.log('=== URL ===', s.page.url());
  console.log(aria);
  await s.decide('Entered the ground/campus and captured the full 1920x1080 view.');
} finally {
  await s.close();
}
