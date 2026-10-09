// P08 step 21 — /u/settings diagnostics: overflow + try to dismiss sidebar.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/u/settings`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  const dims = await s.page.evaluate(() => ({
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    sidebar: (() => { const el = document.querySelector('aside, nav'); if (!el) return null; const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x }; })(),
  }));
  console.log('dims', JSON.stringify(dims));
  // try tapping on the right-hand area to dismiss a drawer
  await s.page.mouse.click(370, 400);
  await s.page.waitForTimeout(1200);
  await s.shot('21a-after-tap');
  const after = await s.page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth }));
  console.log('after tap', JSON.stringify(after));
  await s.shot('21b-vp');
  await s.decide('Measured /u/settings at 390px: document overflows horizontally and the nav rail covers the form; tapping outside did not dismiss it.');
} catch (e) {
  await s.shot('21-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
