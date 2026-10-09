// P06 step 18 — open Manager screen to hire a manager.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  // clear modals
  for (let i = 0; i < 5; i++) {
    const b = s.page.getByRole('button', { name: /Let's go!|Got it|Continue/ }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await s.page.waitForTimeout(1000); } else break;
  }
  const t0 = Date.now();
  await s.page.getByRole('button', { name: 'Manager', exact: true }).last().click();
  await s.page.waitForTimeout(4000);
  console.log(`[nav] Manager opened in ${Date.now() - t0} ms, url=${s.page.url()}`);
  await s.shot('28-manager');
  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria.slice(0, 4000));
  console.log('------------------------------------------------------');
  await s.decide(`Opened Manager screen (${Date.now() - t0} ms to render after tap).`);
} finally {
  await s.close();
}
