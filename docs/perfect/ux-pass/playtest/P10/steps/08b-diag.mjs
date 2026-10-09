// P10 step 08b: diagnose why some controls report positions beyond the viewport.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  const letsGo = s.page.getByRole('button', { name: /Let's go/ });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1200); }

  const info = await s.page.evaluate(() => {
    const de = document.documentElement;
    const bodyInfo = {
      innerW: window.innerWidth, innerH: window.innerHeight,
      docScrollH: de.scrollHeight, docClientH: de.clientHeight,
      bodyScrollH: document.body.scrollHeight, bodyScrollW: document.body.scrollWidth,
    };
    const targets = [...document.querySelectorAll('button,a,[role="button"]')].filter((el) => {
      const n = (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim());
      return /New headlines|lineup slot|till is full/i.test(n);
    });
    const details = targets.map((el) => {
      const r = el.getBoundingClientRect();
      const chain = [];
      let p = el;
      for (let i = 0; i < 8 && p; i++) {
        const cs = getComputedStyle(p);
        chain.push(`${p.tagName}.${(p.className || '').toString().slice(0, 40)} pos=${cs.position} tr=${cs.transform} vis=${cs.visibility} disp=${cs.display} op=${cs.opacity}`);
        p = p.parentElement;
      }
      return { name: (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent || '').trim()).replace(/\s+/g, ' ').slice(0, 50), rect: { x: r.x, y: r.y, w: r.width, h: r.height }, chain };
    });
    return { bodyInfo, details };
  });
  fs.writeFileSync(`${s.dir}\\diag-08b.json`, JSON.stringify(info, null, 2), 'utf8');
  console.log(JSON.stringify(info, null, 2));
  await s.decide('Diagnosed off-screen control coordinates (long document / transformed layer).');
} finally {
  await s.close();
}
