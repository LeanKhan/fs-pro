// P01 resumed step 09b — diagnose list duplicates, sign within first VISIBLE article.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tapText = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1100); return true; }
  return false;
};
const signOne = async (label) => {
  const arts = s.page.locator('article:visible');
  const n = await arts.count();
  if (!n) { console.log('no visible article'); return false; }
  const art = arts.first();
  const sign = art.getByText('Sign', { exact: true }).first();
  if (!(await sign.count())) { console.log('no Sign in first visible article'); return false; }
  const who = (await art.innerText()).split('\n').slice(0, 3).join(' ');
  await sign.click({ force: true });
  await s.page.waitForTimeout(1200);
  const conf = s.page.getByText(/Sign for V/).first();
  if (await conf.count()) {
    await conf.click({ force: true });
    await s.page.waitForTimeout(1400);
    console.log(`signed (${label}) ${who}`);
    return true;
  }
  console.log(`no confirm for ${label} ${who}`);
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

  console.log('articles total:', await s.page.locator('article').count());
  console.log('articles visible:', await s.page.locator('article:visible').count());

  const gk = s.page.getByText('GK', { exact: true }).first();
  if (await gk.count()) { await gk.click({ force: true }).catch(() => {}); await s.page.waitForTimeout(900); }
  console.log('after GK filter, visible articles:', await s.page.locator('article:visible').count());
  await s.shot('s02-12-gk-filter');
  await signOne('GK#1');
  const all = s.page.getByText('ALL', { exact: true }).first();
  if (await all.count()) { await all.click({ force: true }).catch(() => {}); await s.page.waitForTimeout(900); }

  for (let i = 2; i <= 12; i++) {
    const ok = await signOne('#' + i);
    if (!ok) { console.log('stopping at i=' + i); break; }
  }
  console.log('=== AFTER SQUAD ===');
  const snap = await s.ariaSnapshot();
  console.log(snap.split('\n').filter((l) => /player|keeper|Sign 1|matchday|XP|progressbar|listitem/.test(l)).join('\n'));
  await s.shot('s02-13-squad-signed');
  await s.decide('Signed a goalkeeper and outfielders scoped to the first visible player card.');
} catch (e) {
  await s.shot('s02-error9b');
  await s.decide(`Blocked squad (09b): ${e.message}`);
} finally {
  await s.close();
}
