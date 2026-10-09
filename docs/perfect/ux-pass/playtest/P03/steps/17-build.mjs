// P03 step 17 — inspect campus HUD numbers + open Build panel (costs).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  // zoom the top HUD bar for legibility
  await s.page.screenshot({ path: s.dir + '/screenshots/17-hud-clip.png', clip: { x: 0, y: 0, width: 960, height: 110 } });
  await s.shot('17-campus');
  // read HUD text line
  const aria = await s.ariaSnapshot();
  const hudLine = aria.split('\n').find(l => /\/100/.test(l)) || '';
  console.log('[HUD]', hudLine.trim());
  console.log('[Vintra/near]', aria.split('\n').filter(l=>/Gate|gate|Vintra|XP|V\d/.test(l)).slice(0,12).join('\n'));
  // open Build
  const build = s.page.getByRole('button', { name: 'Build', exact: true });
  await build.first().click();
  await s.page.waitForTimeout(2500);
  await s.shot('17-build-panel');
  console.log('===== BUILD ARIA =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 120).join('\n'));
  await s.decide('Captured campus HUD clip and opened the Build panel.');
} catch (e) {
  await s.shot('17-error');
  await s.decide(`Build panel failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
