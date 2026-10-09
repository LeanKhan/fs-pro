// P06 step 13 — enter campus, measure load + fps.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(5000);
  console.log(`[url] ${s.page.url()}`);

  const go = s.page.getByRole('button', { name: /Go to your ground/ });
  if (await go.count()) {
    const t0 = Date.now();
    await go.click();
    await s.page.waitForTimeout(2000);
    console.log(`[timing] go-to-ground click accepted in ${Date.now() - t0} ms; url now ${s.page.url()}`);
  }
  // Wait for campus to settle.
  await s.page.waitForTimeout(7000);
  await s.shot('21-campus-arrival');
  console.log(`[url] ${s.page.url()}`);

  const fps = await s.page.evaluate(async () => {
    let frames = 0, worstGap = 0, last = performance.now();
    const start = last;
    await new Promise((res) => {
      function loop() {
        const now = performance.now();
        const gap = now - last; last = now;
        if (gap > worstGap) worstGap = gap;
        frames++;
        if (now - start >= 4000) return res();
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
    const ms = performance.now() - start;
    return { frames, ms: Math.round(ms), fps: +(frames / (ms / 1000)).toFixed(1), worstFrameGapMs: Math.round(worstGap) };
  }).catch((e) => ({ error: e.message }));
  console.log('[fps]', JSON.stringify(fps));

  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria.slice(0, 5000));
  console.log('------------------------------------------------------');
  await s.decide(`Campus arrival: url=${s.page.url()}. rAF fps over 4s: ${JSON.stringify(fps)}.`);
} finally {
  await s.close();
}
