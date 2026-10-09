// P06 step 21 — find staff/manager hiring: top header Squad + First steps.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  for (let i = 0; i < 5; i++) {
    const b = s.page.getByRole('button', { name: /Let's go!|Got it|Continue/ }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await s.page.waitForTimeout(1000); } else break;
  }

  async function clickJs(re, label) {
    const ok = await s.page.evaluate(({ re, label }) => {
      const rx = new RegExp(re);
      const btns = [...document.querySelectorAll('button')].filter((b) => rx.test((b.textContent || '').trim()));
      const b = btns[0];
      if (b) { b.click(); return true; }
      return false;
    }, { re: re.source, label }).catch(() => false);
    await s.page.waitForTimeout(4000);
    const aria = await s.ariaSnapshot();
    console.log(`[${label}] clicked=${ok}`);
    console.log(aria.split('\n').filter((l) => /heading|tab|button|columnheader/.test(l)).slice(0, 40).join('\n'));
    console.log('-----');
  }

  // 1. Top header "Squad" (first Squad button in DOM order).
  await clickJs(/^Squad$/, 'top-Squad');
  await s.shot('33-topsquad');

  // Close any drawer.
  const close = s.page.getByRole('button', { name: 'Close' }).first();
  if (await close.count() && await close.isVisible().catch(() => false)) { await close.click().catch(() => {}); await s.page.waitForTimeout(1500); }

  // 2. First steps checklist.
  await clickJs(/^First steps/, 'first-steps');
  await s.shot('34-first-steps');
  await s.decide('Explored top Squad button and First-steps checklist looking for the manager-hiring entry point.');
} finally {
  await s.close();
}
