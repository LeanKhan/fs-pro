// P09 step 11 — sort filters + touch-target measurement on the manager market.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1200); }
  await s.page.getByRole('button', { name: /Sign a manager/ }).click();
  await s.page.waitForTimeout(2000);
  const start = s.page.getByRole('button', { name: /start the program/ });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(2500); }

  // Measure interactive target sizes (live DOM of the screen I can see).
  const measures = await s.page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a, input, [role="button"], [role="checkbox"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34);
      out.push({ label, w: Math.round(r.width), h: Math.round(r.height) });
    });
    return out;
  });
  const small = measures.filter((m) => m.h < 44 || m.w < 44);
  console.log(`[measure] ${measures.length} interactive elements; ${small.length} under 44px in one dimension:`);
  small.slice(0, 40).forEach((m) => console.log(`  ${m.h}x${m.w}  "${m.label}"`));

  await s.page.getByRole('button', { name: 'Best rated' }).click();
  await s.page.waitForTimeout(1200);
  await s.shot('11-manager-best-rated');
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step11-best-aria.txt', aria);
  console.log('--- BEST RATED (head) ---');
  console.log(aria.split('\n').slice(0, 40).join('\n'));
  await s.decide('On the manager market: measured touch targets (many <44px) and tapped the "Best rated" sort.');
} finally {
  await s.close();
}
console.log('DONE');
