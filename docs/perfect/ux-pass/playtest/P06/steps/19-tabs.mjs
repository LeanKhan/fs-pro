// P06 step 19 — tab strip overflow in Owner's office; reach Recruitment.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  for (let i = 0; i < 5; i++) {
    const b = s.page.getByRole('button', { name: /Let's go!|Got it|Continue/ }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await s.page.waitForTimeout(1000); } else break;
  }
  await s.page.getByRole('button', { name: 'Manager', exact: true }).last().click();
  await s.page.waitForTimeout(3000);

  const tabInfo = await s.page.evaluate(() => {
    const rec = [...document.querySelectorAll('button')].find((b) => /^Recruitment$/.test((b.textContent || '').trim()));
    if (!rec) return { found: false };
    const nav = rec.closest('nav') || rec.parentElement;
    const r = rec.getBoundingClientRect();
    const navR = nav.getBoundingClientRect();
    return {
      found: true,
      recruitmentRect: { left: Math.round(r.left), right: Math.round(r.right) },
      navRect: { left: Math.round(navR.left), right: Math.round(navR.right), width: Math.round(navR.width) },
      navScrollWidth: nav.scrollWidth, navClientWidth: nav.clientWidth,
      navScrollable: nav.scrollWidth > nav.clientWidth + 2,
      inViewport: r.left >= 0 && r.right <= window.innerWidth,
    };
  });
  console.log('[tabs-before]', JSON.stringify(tabInfo));
  await s.shot('29-tabs-before-scroll');

  // Try to scroll the tab strip horizontally.
  await s.page.evaluate(() => {
    const rec = [...document.querySelectorAll('button')].find((b) => /^Recruitment$/.test((b.textContent || '').trim()));
    const nav = rec?.closest('nav') || rec?.parentElement;
    if (nav) nav.scrollLeft = nav.scrollWidth;
  });
  await s.page.waitForTimeout(1200);
  const afterScroll = await s.page.evaluate(() => {
    const rec = [...document.querySelectorAll('button')].find((b) => /^Recruitment$/.test((b.textContent || '').trim()));
    const r = rec.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), inViewport: r.left >= 0 && r.right <= window.innerWidth };
  });
  console.log('[tabs-after]', JSON.stringify(afterScroll));
  await s.shot('30-tabs-after-scroll');

  // If Recruitment is reachable, click it.
  try { await recClick(); } catch (e) { console.log('click err', e.message); }
  async function recClick() {
    await s.page.evaluate(() => {
      const rec = [...document.querySelectorAll('button')].find((b) => /^Recruitment$/.test((b.textContent || '').trim()));
      if (rec) rec.click();
    });
    await s.page.waitForTimeout(4000);
    await s.shot('31-recruitment');
    const aria = await s.ariaSnapshot();
    console.log('[aria] ------------------------------------------------');
    console.log(aria.slice(1500, 5000));
    console.log('------------------------------------------------------');
  }
  await s.decide(`Owner's office tab strip: Recruitment inViewport(before)=${tabInfo.inViewport}, navScrollable=${tabInfo.navScrollable}; after programmatic scroll inViewport=${afterScroll.inViewport}.`);
} finally {
  await s.close();
}
