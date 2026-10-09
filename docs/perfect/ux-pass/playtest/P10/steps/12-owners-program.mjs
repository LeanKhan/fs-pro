// P10 step 12: open the Owner's program panel and capture it.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  const letsGo = s.page.getByRole('button', { name: /Let's go/ });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }

  await s.page.getByRole('button', { name: /Owner's program/ }).click({ force: true });
  await s.page.waitForTimeout(2500);
  await s.shot('12-owners-program');
  const aria = await s.ariaSnapshot();
  dump('12-owners-program', aria);
  console.log('=== URL ===', s.page.url());
  console.log(aria);
  await s.decide('Opened the Owner\'s program panel and captured it.');
} catch (e) {
  console.log('ERROR:', e && e.message);
  try { await s.shot('12-error'); } catch {}
} finally {
  await s.close();
  process.exit(0);
}
