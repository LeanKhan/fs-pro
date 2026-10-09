// P03 step 25 — collect the till (force-click) + read the Build panel fully.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.first().click(); await s.page.waitForTimeout(800); }

  const chip = s.page.getByRole('button', { name: /\+V20k/ });
  console.log('till chips:', await chip.count());
  if (await chip.count()) {
    // motion proof: two stills a moment apart
    await s.shot('25-till-t0');
    await s.page.waitForTimeout(600);
    await s.shot('25-till-t1');
    console.log('collect title:', await chip.first().getAttribute('title'));
    await chip.first().click({ force: true, timeout: 10_000 });
    await s.page.waitForTimeout(2500);
    await s.shot('25-after-collect');
    console.log('===== AFTER COLLECT ARIA (top) =====');
    console.log((await s.ariaSnapshot()).split('\n').slice(0, 40).join('\n'));
  }

  const build = s.page.getByRole('button', { name: 'Build', exact: true });
  await build.first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('25-build-panel');
  console.log('===== BUILD ARIA =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 160).join('\n'));
  await s.decide('Session 3: collected the bobbing till takings and read the Build panel.');
} catch (e) {
  await s.shot('25-error');
  await s.decide(`25 failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close().catch(() => {});
  process.exit(0);
}
