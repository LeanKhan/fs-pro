// P06 step 17 — identify reduced-motion-ignoring animation targets.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);

  const targets = await s.page.evaluate(() => {
    const anims = document.getAnimations ? document.getAnimations() : [];
    return anims.map((a) => {
      const t = a.effect && a.effect.target;
      const cs = t ? getComputedStyle(t) : null;
      const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
      return {
        name: a.animationName,
        duration: a.effect && a.effect.getTiming ? a.effect.getTiming().duration : null,
        iterations: a.effect && a.effect.getTiming ? a.effect.getTiming().iterations : null,
        tag: t ? t.tagName : null,
        cls: t ? String(t.className).slice(0, 70) : null,
        text: t ? (t.textContent || '').trim().slice(0, 40) : null,
        animationNameCss: cs ? cs.animationName : null,
        rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
      };
    });
  }).catch((e) => ({ error: e.message }));
  console.log('[anim-targets]', JSON.stringify(targets, null, 2));
  await s.decide(`Reduced-motion audit: ${Array.isArray(targets) ? targets.length : '?'} animations still running with reduce set: ${Array.isArray(targets) ? targets.map((t) => t.name).join(', ') : targets.error}.`);
} finally {
  await s.close();
}
