// P05 Session 4f: trace the tab order on the Facilities program screen.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { dismissModals, activeInfo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  await dismissModals(s.page);
  await s.page.getByRole('heading', { name: /Build the foundations/i }).waitFor({ timeout: 30000 }).catch(() => {});
  // Open the program if we are on the campus.
  if (!(await s.page.getByRole('button', { name: /Build Tier 1/ }).count())) {
    const owner = s.page.getByRole('button', { name: /Owner's program/i });
    if (await owner.count()) { await owner.first().focus(); await s.page.keyboard.press('Enter'); }
    await s.page.waitForTimeout(2500);
  }
  await s.page.getByRole('button', { name: 'Build Tier 1' }).first().waitFor({ timeout: 60000 });
  await s.page.evaluate(() => (document.activeElement && document.activeElement.blur(), document.body.focus()));
  for (let i = 1; i <= 45; i++) {
    await s.page.keyboard.press('Tab');
    await s.page.waitForTimeout(35);
    const a = await activeInfo(s.page);
    console.log(`${String(i).padStart(2)} ${a.tag.padEnd(8)} ${a.name}`);
  }
  console.log(`shot=${await s.shot('35-facilities-tabtrace')}`);
  await s.decide('Traced 45 tab stops on the Facilities program screen.');
} finally {
  await s.close();
}
