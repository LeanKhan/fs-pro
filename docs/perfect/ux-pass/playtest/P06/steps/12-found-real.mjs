// P06 step 12 — found the club, land on campus, measure load + fps.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(3500);
  await s.page.getByRole('button', { name: /Next: your club/ }).click();
  await s.page.waitForTimeout(2000);
  await s.page.getByRole('textbox', { name: 'Club name' }).waitFor({ timeout: 20_000 });
  await s.page.getByRole('textbox', { name: 'Club name' }).fill('Lowend United');
  await s.page.getByRole('textbox', { name: /Ground/ }).fill('Lowend Park');
  await s.page.getByRole('textbox', { name: 'Code' }).fill('LOW');
  await s.page.waitForTimeout(500);
  await s.page.getByRole('button', { name: /Next: kick-off/ }).click();
  await s.page.waitForTimeout(2500);
  await s.page.getByRole('button', { name: /Found Lowend United/ }).waitFor({ timeout: 20_000 });

  const t0 = Date.now();
  await s.page.getByRole('button', { name: /Found Lowend United/ }).click();
  // Wait until we leave /start (campus route).
  await s.page.waitForFunction(() => !location.pathname.startsWith('/start'), { timeout: 60_000 }).catch(() => {});
  const foundMs = Date.now() - t0;
  await s.page.waitForTimeout(6000);
  await s.shot('19-campus');
  console.log(`[timing] found->campus ${foundMs} ms, url=${s.page.url()}`);

  // FPS probe over 3s via rAF.
  const fps = await s.page.evaluate(async () => {
    let frames = 0;
    const start = performance.now();
    await new Promise((res) => {
      function loop() {
        frames++;
        if (performance.now() - start >= 3000) return res();
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
    return { frames, ms: Math.round(performance.now() - start), fps: +(frames / ((performance.now() - start) / 1000)).toFixed(1) };
  }).catch((e) => ({ error: e.message }));
  console.log('[fps]', JSON.stringify(fps));

  const reduced = await s.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  console.log(`[reduced-motion] ${reduced}`);
  await s.shot('20-campus-after-probe');
  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria.slice(0, 4000));
  console.log('------------------------------------------------------');
  await s.decide(`Founded club -> campus in ${foundMs} ms. rAF fps over 3s: ${JSON.stringify(fps)}. reduced-motion=${reduced}.`);
} finally {
  await s.close();
}
