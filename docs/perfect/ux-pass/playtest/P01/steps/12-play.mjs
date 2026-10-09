// P01 resumed step 12 — open PLAY (matchmaking) from the campus.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tapText = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1300); return true; }
  return false;
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(500); }
  }
  // Back to the grounds if a program is open.
  const back = s.page.getByRole('button', { name: 'Back to the grounds' });
  if (await back.count()) { await back.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(1000); }

  const play = s.page.getByRole('button', { name: /PLAY/ }).first();
  console.log('PLAY button count:', await play.count());
  await play.click({ force: true });
  await s.page.waitForTimeout(1800);
  console.log('=== AFTER PLAY ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-17-play');
  await s.decide('Tapped PLAY on the campus dock to find a friendly match.');
} catch (e) {
  await s.shot('s02-error12');
  await s.decide(`Blocked opening PLAY: ${e.message}`);
} finally {
  await s.close();
}
