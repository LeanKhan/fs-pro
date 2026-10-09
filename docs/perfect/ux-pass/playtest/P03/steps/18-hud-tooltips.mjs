// P03 step 18 — probe HUD pill tooltips/labels.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const probe = async (x, y, tag) => {
  await s.page.mouse.move(5, 400);
  await s.page.waitForTimeout(300);
  await s.page.mouse.move(x, y, { steps: 5 });
  await s.page.waitForTimeout(900);
  await s.page.screenshot({ path: `${s.dir}/screenshots/18-hover-${tag}.png`, clip: { x: 0, y: 0, width: 960, height: 260 } });
  const aria = await s.ariaSnapshot();
  const tip = aria.split('\n').filter(l => /tooltip|Tip|Capacity|Fans|Reput|energy|Energy|balance|Balance|V\d|coins|Coins/i.test(l)).slice(0, 8);
  console.log(`[${tag}]`, tip.join(' | '));
};
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  await probe(263, 41, 'fans150');
  await probe(400, 41, 'star5');
  await probe(548, 41, 'bolt116');
  await probe(172, 41, 'cash');
  await s.decide('Probed HUD pills for tooltips (fans/star/bolt/cash).');
} catch (e) {
  await s.shot('18-error');
  await s.decide(`HUD tooltip probe failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
