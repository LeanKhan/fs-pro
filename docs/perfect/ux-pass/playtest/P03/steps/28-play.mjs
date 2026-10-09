// P03 step 28 — open the PLAY dock and see the match options.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
async function done() {
  await Promise.race([s.close().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]);
  process.exit(0);
}
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.first().click(); await s.page.waitForTimeout(800); }

  const play = s.page.getByRole('button', { name: /^PLAY/ });
  console.log('play buttons:', await play.count());
  await play.first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('28-play-dock');
  console.log('URL after PLAY:', s.page.url());
  console.log('===== PLAY ARIA =====');
  console.log(await s.ariaSnapshot());
  await s.decide('Session 3: opened the PLAY dock to find the match options.');
} catch (e) {
  await s.shot('28-error');
  await s.decide(`28 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
