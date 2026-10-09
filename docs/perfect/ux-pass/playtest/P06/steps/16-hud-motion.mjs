// P06 step 16 — HUD zoom + reduced-motion animation audit + resource timing.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);

  // Dismiss advisor tip if visible.
  const dismiss = s.page.getByRole('button', { name: /Dismiss this tip/ });
  if (await dismiss.count()) { await dismiss.click().catch(() => {}); await s.page.waitForTimeout(1200); }

  // Zoom into the top-left HUD cluster.
  await s.page.screenshot({ path: `${s.screenshotsDir}/26-hud-topleft-zoom.png`, clip: { x: 0, y: 0, width: 220, height: 90 } });
  await s.shot('27-campus-hud');

  // Reduced-motion audit: what animations/transitions are running?
  const anim = await s.page.evaluate(() => {
    const anims = document.getAnimations ? document.getAnimations() : [];
    return {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      runningAnimations: anims.length,
      sample: anims.slice(0, 20).map((a) => ({
        name: a.animationName || (a.effect && a.effect.target && a.effect.target.className) || a.constructor.name,
        playState: a.playState,
        duration: a.effect && a.effect.getTiming ? a.effect.getTiming().duration : null,
      })),
    };
  }).catch((e) => ({ error: e.message }));
  console.log('[anim-audit]', JSON.stringify(anim, null, 2));

  // Resource timing: how heavy is the bundle on Slow 4G?
  const res = await s.page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const byType = {};
    for (const r of resources) { byType[r.initiatorType] = byType[r.initiatorType] || { n: 0, transfer: 0, decoded: 0 }; byType[r.initiatorType].n++; byType[r.initiatorType].transfer += r.transferSize || 0; byType[r.initiatorType].decoded += r.decodedBodySize || 0; }
    const js = resources.filter((r) => /\.js($|\?)/.test(r.name)).reduce((a, r) => a + (r.transferSize || 0), 0);
    return {
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
      resourceCount: resources.length,
      jsTransferBytes: js,
      byType,
    };
  }).catch((e) => ({ error: e.message }));
  console.log('[resource-timing]', JSON.stringify(res, null, 2));
  await s.decide(`Reduced-motion=${anim.reducedMotion}; running animations=${anim.runningAnimations}; resources=${res.resourceCount}, js transfer=${res.jsTransferBytes}B.`);
} finally {
  await s.close();
}
