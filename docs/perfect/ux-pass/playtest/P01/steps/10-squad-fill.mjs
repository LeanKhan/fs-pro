// P01 resumed step 10 — keep signing until the squad is 11 (one GK).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tapText = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1000); return true; }
  return false;
};
const rosterCount = async () => {
  const t = await s.page.locator('body').innerText().catch(() => '');
  const m = t.match(/matchday squad (\d+)\/11/i);
  return m ? Number(m[1]) : -1;
};
const signOne = async (label) => {
  const art = s.page.locator('article:visible').first();
  if (!(await art.count())) return false;
  const sign = art.getByText('Sign', { exact: true }).first();
  if (!(await sign.count())) return false;
  const who = (await art.innerText()).split('\n').slice(0, 2).join(' ');
  await sign.click({ force: true });
  await s.page.waitForTimeout(1100);
  const conf = s.page.getByText(/Sign for V/).first();
  if (await conf.count()) { await conf.click({ force: true }); await s.page.waitForTimeout(1200); }
  console.log(`${label} -> ${who}`);
  return true;
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(500); }
  }
  await tapText("Owner's program");
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(1400); }

  console.log('roster before:', await rosterCount());
  for (let i = 0; i < 16; i++) {
    const before = await rosterCount();
    if (before >= 11) break;
    await signOne('attempt' + i);
  }
  console.log('=== AFTER SQUAD ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-14-squad-full');
  await s.decide('Kept signing the first visible free agent until the matchday squad reached 11.');
} catch (e) {
  await s.shot('s02-error10');
  await s.decide(`Blocked filling squad: ${e.message}`);
} finally {
  await s.close();
}
