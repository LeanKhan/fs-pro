// P06 step 06 — definitive: scroll the actual container and check button visibility.
import { personaContext, PERSONAS } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext({ ...PERSONAS.P06, id: 'P06check' });
try {
  await s.page.goto(`${s.url}/auth/join`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(1500);

  const before = await s.page.evaluate(() => {
    const c = document.querySelector('div.cozy.auth');
    const btn = [...document.querySelectorAll('button')].find((b) => /create account/i.test(b.textContent || ''));
    const r = btn?.getBoundingClientRect();
    return { containerScrollTop: c?.scrollTop, containerScrollHeight: c?.scrollHeight, containerClientHeight: c?.clientHeight, btnTop: r && Math.round(r.top), btnBottom: r && Math.round(r.bottom) };
  });
  console.log('[before]', JSON.stringify(before));

  // Real input: wheel over the container.
  await s.page.mouse.move(180, 400);
  await s.page.mouse.wheel(0, 1000);
  await s.page.waitForTimeout(700);
  const afterWheel = await s.page.evaluate(() => {
    const c = document.querySelector('div.cozy.auth');
    const btn = [...document.querySelectorAll('button')].find((b) => /create account/i.test(b.textContent || ''));
    const r = btn?.getBoundingClientRect();
    return { containerScrollTop: c?.scrollTop, btnTop: r && Math.round(r.top), btnBottom: r && Math.round(r.bottom) };
  });
  console.log('[afterWheel]', JSON.stringify(afterWheel));
  await s.shot('09-join-after-real-wheel');
  await s.decide(`Join form container scroll: before scrollTop=${before.containerScrollTop}, after real wheel=${afterWheel.containerScrollTop}; Create account top ${before.btnTop}->${afterWheel.btnTop}.`);
} finally {
  await s.close();
}
