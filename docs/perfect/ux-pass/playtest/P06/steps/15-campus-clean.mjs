// P06 step 15 — clear modals, clean campus, idle fps, HUD inspect.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  console.log(`[url] ${s.page.url()}`);

  // Dismiss modal queue (Let's go! / Close / ✕), max 6.
  for (let i = 0; i < 6; i++) {
    const lets = s.page.getByRole('button', { name: /Let's go!|Got it|Continue|Close/ }).first();
    const closeX = s.page.getByRole('button', { name: 'Close' }).first();
    let clicked = false;
    if (await lets.count() && await lets.isVisible().catch(() => false)) { await lets.click().catch(() => {}); clicked = true; }
    else if (await closeX.count() && await closeX.isVisible().catch(() => false)) { await closeX.click().catch(() => {}); clicked = true; }
    if (!clicked) break;
    await s.page.waitForTimeout(1200);
  }
  await s.page.waitForTimeout(1500);
  await s.shot('24-campus-clean');

  const fps = await s.page.evaluate(async () => {
    let frames = 0, worst = 0, last = performance.now();
    const start = last; const gaps = [];
    await new Promise((res) => {
      function loop() {
        const now = performance.now(); const gap = now - last; last = now;
        gaps.push(gap); if (gap > worst) worst = gap; frames++;
        if (now - start >= 5000) return res();
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
    const ms = performance.now() - start; gaps.sort((a, b) => a - b);
    return { fps: +(frames / (ms / 1000)).toFixed(1), worstGapMs: Math.round(worst), p95GapMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] || 0), framesOver50ms: gaps.filter((g) => g > 50).length };
  }).catch((e) => ({ error: e.message }));
  console.log('[fps-clean]', JSON.stringify(fps));
  await s.shot('25-campus-fps-clean');

  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria.slice(0, 2500));
  console.log('------------------------------------------------------');
  await s.decide(`Cleared modals; clean campus idle fps ${fps.fps} (worst ${fps.worstGapMs}ms, p95 ${fps.p95GapMs}ms, >50ms frames ${fps.framesOver50ms}).`);
} finally {
  await s.close();
}
