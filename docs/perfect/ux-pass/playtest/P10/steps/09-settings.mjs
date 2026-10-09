// P10 step 09: open Settings and walk every tab.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
const tabNames = async () => {
  return await s.page.evaluate(() => [...document.querySelectorAll('[role="tab"], .v-tab, .v-btn--variant-tab, nav button')].map((e) => (e.textContent || '').trim()).filter(Boolean));
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  const letsGo = s.page.getByRole('button', { name: /Let's go/ });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1000); }

  await s.page.getByRole('button', { name: 'Settings' }).click();
  await s.page.waitForTimeout(2000);
  await s.shot('09-settings');
  const a1 = await s.ariaSnapshot();
  dump('09-settings', a1);
  console.log('=== URL ===', s.page.url());
  console.log('--- SETTINGS (initial) ---');
  console.log(a1);
  console.log('--- tabs? ---', JSON.stringify(await tabNames()));
  await s.decide('Opened Settings from the campus gear and captured it.');
} finally {
  await s.close();
}
