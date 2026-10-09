// P10 step 08: dismiss modal + advisor, inventory visible controls by accessible name.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);

  const letsGo = s.page.getByRole('button', { name: /Let's go/ });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1500); }
  await s.shot('08-campus-dismissed');

  // Inventory the controls a person can click (rendered accessible names + boxes).
  const controls = await s.page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a, [role="button"], [role="link"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim() || '').replace(/\s+/g, ' ').slice(0, 60);
      out.push(`${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} [${el.tagName}${el.getAttribute('role') ? '/' + el.getAttribute('role') : ''}] "${name}"`);
    }
    return out;
  });
  fs.writeFileSync(`${s.dir}\\controls-08.txt`, controls.join('\n'), 'utf8');
  console.log('--- CONTROLS ---');
  console.log(controls.join('\n'));
  const aria = await s.ariaSnapshot();
  dump('08-campus', aria);
  await s.decide('Dismissed the welcome modal; captured campus and inventory of clickable controls.');
} finally {
  await s.close();
}
