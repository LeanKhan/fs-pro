// P06 step 05 — find the join form's scroll container; test touch drag.
import { personaContext, PERSONAS } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext({ ...PERSONAS.P06, id: 'P06check' });
try {
  await s.page.goto(`${s.url}/auth/join`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(1500);

  const scrollables = await s.page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if ((el.scrollHeight - el.clientHeight > 4 || el.scrollWidth - el.clientWidth > 4) &&
          /(auto|scroll)/.test(cs.overflowY + cs.overflowX)) {
        out.push({
          tag: el.tagName, cls: (el.className && String(el.className).slice(0, 60)) || '',
          overflowY: cs.overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
          rectTop: Math.round(el.getBoundingClientRect().top), rectBottom: Math.round(el.getBoundingClientRect().bottom),
        });
      }
    });
    return out;
  });
  console.log('[scrollables]', JSON.stringify(scrollables, null, 2));

  // Touch drag upward from the middle of the card.
  await s.page.touchscreen.tap(180, 300);
  await s.page.waitForTimeout(200);
  await s.page.evaluate(() => {
    const card = document.querySelector('main') || document.body;
    const start = new Touch({ identifier: 1, target: card, clientX: 180, clientY: 600, pageX: 180, pageY: 600 });
    const end = new Touch({ identifier: 1, target: card, clientX: 180, clientY: 150, pageX: 180, pageY: 150 });
    const mk = (type, t) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] });
    card.dispatchEvent(mk('touchstart', start));
    card.dispatchEvent(mk('touchmove', end));
    card.dispatchEvent(mk('touchend', end));
  });
  await s.page.waitForTimeout(600);
  const after = await s.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /create account/i.test(b.textContent || ''));
    const r = btn?.getBoundingClientRect();
    const scrolls = [];
    document.querySelectorAll('*').forEach((el) => { if (el.scrollTop) scrolls.push({ tag: el.tagName, cls: String(el.className).slice(0,50), scrollTop: el.scrollTop }); });
    return { createAccountTop: r && Math.round(r.top), createAccountBottom: r && Math.round(r.bottom), scrolledEls: scrolls };
  });
  console.log('[after-touch-drag]', JSON.stringify(after, null, 2));
  await s.shot('08-join-after-touch-drag');
  await s.decide('Diagnosed join-form overflow: document/body do not scroll; checking inner containers + touch drag.');
} finally {
  await s.close();
}
