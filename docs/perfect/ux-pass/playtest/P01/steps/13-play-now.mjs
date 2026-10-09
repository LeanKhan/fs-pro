// P01 resumed step 13 — Play now vs the matched club; capture the result.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tapText = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1200); return true; }
  return false;
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(500); }
  }
  const back = s.page.getByRole('button', { name: 'Back to the grounds' });
  if (await back.count()) { await back.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(800); }

  await s.page.getByRole('button', { name: /PLAY/ }).first().click({ force: true });
  await s.page.waitForTimeout(1600);
  await tapText('Play now');
  await s.page.waitForTimeout(4000);
  console.log('=== AFTER PLAY NOW ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-18-match-result');
  await s.decide('Tapped "Play now" against the matched club; waited for the match result.');
} catch (e) {
  await s.shot('s02-error13');
  await s.decide(`Blocked playing match: ${e.message}`);
} finally {
  await s.close();
}
