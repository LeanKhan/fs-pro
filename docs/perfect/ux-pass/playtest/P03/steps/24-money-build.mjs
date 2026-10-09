// P03 step 24 — probe the floating +V20k money affordance and the Build panel.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const money = (aria) => aria.split('\n').filter(l => /V[\d,.]+|wage|Wage|income|Income|balance|Balance|gate|Gate|fee|Fee|budget|Budget|XP|builder|Builder|Tier|min\b|Build|cost|Cost/i.test(l)).slice(0, 60).join('\n');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.first().click(); await s.page.waitForTimeout(800); }

  // 1) the floating +V20k chip
  const chip = s.page.getByRole('button', { name: /\+V20k/ });
  console.log('V20k chips:', await chip.count());
  if (await chip.count()) {
    await chip.first().click();
    await s.page.waitForTimeout(2500);
    await s.shot('24-after-20k');
    console.log('===== AFTER +V20k ARIA =====');
    console.log((await s.ariaSnapshot()));
  }

  // 2) Build panel
  const build = s.page.getByRole('button', { name: 'Build', exact: true });
  if (await build.count()) {
    await build.first().click();
    await s.page.waitForTimeout(2500);
    await s.shot('24-build-panel');
    console.log('===== BUILD ARIA =====');
    console.log((await s.ariaSnapshot()).split('\n').slice(0, 140).join('\n'));
  }
  await s.decide('Session 3: probed +V20k money chip and reopened the Build panel.');
} catch (e) {
  await s.shot('24-error');
  await s.decide(`24 probe failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
