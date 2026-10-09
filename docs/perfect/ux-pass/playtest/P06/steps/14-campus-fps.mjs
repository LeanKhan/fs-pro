// P06 step 14 — dismiss welcome modal, measure sustained campus fps + interaction jank.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  // It should land on campus (game) for a founded club.
  await s.page.waitForTimeout(9000);
  console.log(`[url] ${s.page.url()}`);

  const lets = s.page.getByRole('button', { name: /Let's go!/ });
  if (await lets.count()) {
    await lets.click();
    await s.page.waitForTimeout(1500);
  }
  await s.shot('22-campus-idle');

  // Sustained idle fps over 5s.
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
    const ms = performance.now() - start;
    gaps.sort((a, b) => a - b);
    return {
      frames, ms: Math.round(ms), fps: +(frames / (ms / 1000)).toFixed(1),
      worstGapMs: Math.round(worst), p95GapMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] || 0),
      framesOver50ms: gaps.filter((g) => g > 50).length,
    };
  }).catch((e) => ({ error: e.message }));
  console.log('[fps-idle]', JSON.stringify(fps));

  // Interaction: drag/pan the campus and measure fps during 3s of movement.
  const box = await s.page.viewportSize();
  const cx = Math.round(box.width / 2), cy = Math.round(box.height / 2);
  const fpsMove = await s.page.evaluate(async ({ cx, cy }) => {
    let frames = 0, worst = 0, last = performance.now();
    const start = last;
    let dir = 1;
    const iv = setInterval(() => {
      dir = -dir;
      const step = 60 * dir;
      window.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, pointerId: 1, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + step, clientY: cy + step, pointerId: 1, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: cx + step, clientY: cy + step, pointerId: 1, bubbles: true }));
    }, 120);
    await new Promise((res) => {
      function loop() {
        const now = performance.now(); const gap = now - last; last = now;
        if (gap > worst) worst = gap; frames++;
        if (now - start >= 3000) { clearInterval(iv); return res(); }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
    const ms = performance.now() - start;
    return { frames, fps: +(frames / (ms / 1000)).toFixed(1), worstGapMs: Math.round(worst) };
  }, { cx, cy }).catch((e) => ({ error: e.message }));
  console.log('[fps-pan]', JSON.stringify(fpsMove));
  await s.shot('23-campus-pan');
  await s.decide(`Campus idle fps ${fps.fps} (worst ${fps.worstGapMs}ms, ${fps.framesOver50ms} frames >50ms); pan fps ${fpsMove.fps} (worst ${fpsMove.worstGapMs}ms).`);
} finally {
  await s.close();
}
