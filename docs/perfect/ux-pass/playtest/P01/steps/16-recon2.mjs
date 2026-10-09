// P01 resumed step 16 — reconnect, read club XP, open New headlines.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(500); }
  }
  const t = await s.page.locator('body').innerText();
  const m = t.match(/(\d+)\/100/);
  console.log('CLUB XP:', m ? m[1] : '?');
  await s.shot('s02-22-recon2');

  const nh = s.page.getByRole('button', { name: 'New headlines' });
  if (await nh.count()) {
    await nh.first().click({ force: true });
    await s.page.waitForTimeout(1500);
    console.log('=== NEW HEADLINES ===');
    console.log(await s.ariaSnapshot());
    await s.shot('s02-23-headlines');
  }
  await s.decide('Reconnected; read club XP and opened "New headlines" to look for my match result.');
} catch (e) {
  await s.shot('s02-error16');
  await s.decide(`Recon2 failed: ${e.message}`);
} finally {
  await s.close();
}
