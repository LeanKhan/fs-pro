// P01 resumed step 09 — squad step: sign a GK then outfielders until 11.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tapText = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1100); return true; }
  return false;
};
const signOne = async (label) => {
  const sign = s.page.getByText('Sign', { exact: true }).first();
  if (!(await sign.count())) return false;
  await sign.click({ force: true });
  await s.page.waitForTimeout(1100);
  const conf = s.page.getByText(/Sign for V/).first();
  if (await conf.count()) {
    await conf.click({ force: true });
    await s.page.waitForTimeout(1300);
    console.log(`signed (${label})`);
    return true;
  }
  console.log(`no confirm for ${label}`);
  return false;
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

  // Goalkeeper first.
  const gk = s.page.getByText('GK', { exact: true }).first();
  if (await gk.count()) { await gk.click({ force: true }).catch(() => {}); await s.page.waitForTimeout(900); }
  await s.shot('s02-12-gk-filter');
  await signOne('GK#1');

  // Back to all positions.
  const all = s.page.getByText('ALL', { exact: true }).first();
  if (await all.count()) { await all.click({ force: true }).catch(() => {}); await s.page.waitForTimeout(900); }

  for (let i = 2; i <= 12; i++) {
    const ok = await signOne('#' + i);
    if (!ok) { console.log('stopping at i=' + i); break; }
  }
  console.log('=== AFTER SQUAD ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-13-squad-signed');
  await s.decide('Signed a goalkeeper first, then outfield free agents, until the matchday squad was filled.');
} catch (e) {
  await s.shot('s02-error9');
  await s.decide(`Blocked building squad: ${e.message}`);
} finally {
  await s.close();
}
