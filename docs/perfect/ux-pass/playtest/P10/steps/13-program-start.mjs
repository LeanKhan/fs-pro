// P10 step 13: start the Owner's program (step 1 Manager).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  await s.page.goto(`${s.url}/game/b7867e3f-f0de-4603-99d1-bfc44a1e5280/program`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(3000); }
  await s.shot('13-program-step1');
  const aria = await s.ariaSnapshot();
  dump('13-program-step1', aria);
  console.log('=== URL ===', s.page.url());
  console.log(aria);
  await s.decide('Started the Owner\'s program; captured step 1 (Manager).');
} catch (e) {
  console.log('ERROR:', e && e.message);
  try { await s.shot('13-error'); } catch {}
} finally {
  await s.close();
  process.exit(0);
}
