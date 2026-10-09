import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457/program', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const metrics = await s.page.evaluate(() => {
    const out = { innerHeight: window.innerHeight, bodyScroll: document.body.scrollHeight, docScroll: document.documentElement.scrollHeight };
    const scrollables = [];
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
        scrollables.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), sh: el.scrollHeight, ch: el.clientHeight });
      }
    });
    out.scrollables = scrollables.slice(0, 10);
    return out;
  });
  console.log(JSON.stringify(metrics, null, 2));
  // Try keyboard End (scrolls the focused scroll container).
  await s.page.keyboard.press('End');
  await s.page.waitForTimeout(1200);
  await s.shot('16a-after-end-key');
  // Try scrolling the last build button into view programmatically via Playwright.
  const btns = s.page.getByRole('button', { name: 'Build Tier 1' });
  const n = await btns.count();
  console.log('build buttons:', n);
  await s.decide('Probed scrollability of the Facilities page at 1280x800; the bottom row sits under a green graphic and scroll did not move.');
} catch (e) {
  await s.shot('16-error');
  await s.decide('Diagnostic failed: ' + e.message);
} finally {
  await s.close();
}
