// P02 step 44: diagnose the Hire-a-Manager dialog list (empty? race?).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count()) { await letsGo.first().click().catch(() => {}); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: /^Manager$/ }).first().click().catch(() => {});
  await s.page.waitForTimeout(1200);
  const drawer = s.page.locator('aside.drawer');
  await drawer.getByRole('button', { name: 'Owner', exact: true }).first().click();
  await s.page.waitForTimeout(1000);
  await s.page.getByRole('button', { name: /Hire Head Coach/i }).first().click();
  await s.page.waitForTimeout(1500);

  const dlg = s.page.getByRole('dialog');
  for (let i = 0; i < 6; i++) {
    await s.page.waitForTimeout(2500);
    const liCount = await dlg.locator('li').count();
    const optCount = await dlg.locator('[role="option"], .v-list-item').count();
    const rows = await dlg.locator('.v-list-item-title').allTextContents().catch(() => []);
    console.log(`t=${(i + 1) * 2.5}s li=${liCount} vlistitem=${optCount} titles=${JSON.stringify(rows.slice(0, 20))}`);
  }
  await s.shot('44-hire-waited');
  // Try scrolling the list area.
  const list = dlg.locator('.v-list, [role="listbox"]').first();
  if (await list.count()) { await list.evaluate((el) => { el.scrollTop = el.scrollHeight; }).catch(() => {}); }
  await s.page.waitForTimeout(800);
  await s.shot('44-hire-scrolled');
  console.log('DIALOG HTML (trimmed):');
  const html = await dlg.innerHTML().catch(() => '(none)');
  console.log(html.slice(0, 4000));
  await s.decide('Diagnosed the Hire-a-Manager dialog: waited 15s and scrolled; logging whether any candidate ever appears.');
} catch (e) {
  await s.shot('44-error');
  await s.decide(`Step 44 blocked: ${e.message}`);
} finally {
  await s.close();
}
