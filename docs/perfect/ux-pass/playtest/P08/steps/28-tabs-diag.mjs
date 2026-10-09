// P08 step 28 — diagnose Owner's office tab strip on mobile.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
async function dismiss(s) {
  for (let i = 0; i < 6; i++) {
    const c = s.page.getByRole('button', { name: 'Close' });
    if (await c.count() === 0) break;
    if (!(await c.first().isVisible().catch(() => false))) break;
    await c.first().click({ timeout: 3000, force: true }).catch(() => {});
    await s.page.waitForTimeout(600);
  }
}
const s = await personaContext('P08');
s.page.setDefaultTimeout(8000);
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4500);
  await dismiss(s);
  const mgr = s.page.getByRole('navigation').getByRole('button', { name: 'Manager' });
  const mb = await mgr.boundingBox();
  await s.page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await s.page.waitForTimeout(2000);
  const tabs = s.page.getByRole('button').filter({ hasText: /Matchday|The brief|Recruitment|Owner|Analysis/ });
  const info = await s.page.evaluate(() => {
    const nav = document.querySelector('.modal-root nav, [role="navigation"]');
    const tabsEl = document.querySelector('.v-tabs, .tabs, nav');
    const all = [...document.querySelectorAll('button')].filter(b => /Matchday|The brief|Recruitment|Owner|Analysis/.test(b.textContent||''));
    return {
      tablist: tabsEl ? { scrollW: tabsEl.scrollWidth, clientW: tabsEl.clientWidth, cls: tabsEl.className } : null,
      tabs: all.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), visible: r.right <= 390 && r.x >= 0 }; }),
    };
  });
  console.log('tab info', JSON.stringify(info, null, 2));
  await s.shot('28a-tabs');
  // swipe the tab strip left to reveal the rest
  const strip = s.page.locator('nav').last();
  const sb = await strip.boundingBox();
  console.log('strip box', JSON.stringify(sb));
  if (sb) {
    const y = sb.y + sb.height / 2;
    await s.page.mouse.move(340, y);
    await s.page.mouse.down();
    await s.page.mouse.move(60, y, { steps: 12 });
    await s.page.mouse.up();
    await s.page.waitForTimeout(1200);
  }
  await s.shot('28b-after-swipe');
  console.log('--- ARIA after swipe ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Diagnosed the Owner\'s office tab strip at 390px: measured tab positions and tried a swipe to reveal hidden tabs.');
} catch (e) {
  await s.shot('28-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close().catch(() => {});
  process.exit(0);
}
