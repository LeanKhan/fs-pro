// P06 step 04 — verify whether the join form scrolls on 360x740 (fresh, logged-out context).
import { personaContext, PERSONAS } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext({ ...PERSONAS.P06, id: 'P06check' });
try {
  await s.page.goto(`${s.url}/auth/join`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(1500);
  await s.shot('06-join-scroll-before');

  const metrics = await s.page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const btn = [...document.querySelectorAll('button')].find((b) => /create account/i.test(b.textContent || ''));
    const btnRect = btn ? btn.getBoundingClientRect() : null;
    return {
      windowInnerHeight: window.innerHeight,
      docScrollHeight: de.scrollHeight,
      docClientHeight: de.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      documentCanScroll: de.scrollHeight > de.clientHeight,
      createAccountRect: btnRect && { top: Math.round(btnRect.top), bottom: Math.round(btnRect.bottom) },
      createAccountInViewport: btnRect ? btnRect.bottom <= window.innerHeight && btnRect.top >= 0 : null,
    };
  });
  console.log('[metrics]', JSON.stringify(metrics, null, 2));

  // Try hard to scroll: wheel, keyboard End, and a drag.
  await s.page.mouse.move(180, 400);
  await s.page.mouse.wheel(0, 2000);
  await s.page.waitForTimeout(500);
  await s.page.keyboard.press('End');
  await s.page.waitForTimeout(500);
  const after = await s.page.evaluate(() => ({ scrollY: window.scrollY, docScrollTop: document.documentElement.scrollTop, innerText: (document.querySelector('main')?.scrollTop) ?? null }));
  console.log('[after-scroll]', JSON.stringify(after));
  await s.shot('07-join-scroll-after');
  await s.decide(`Scroll-check on join form: docScrollHeight=${metrics.docScrollHeight} clientHeight=${metrics.docClientHeight} canScroll=${metrics.documentCanScroll}; Create account bottom=${metrics.createAccountRect?.bottom} inViewport=${metrics.createAccountInViewport}.`);
} finally {
  await s.close();
}
