// P02 step 46: diagnose why Hire does nothing (network + console + alert).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  const logs = [];
  s.page.on('console', (m) => logs.push(`console.${m.type()}: ${m.text()}`));
  s.page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  const reqs = [];
  s.page.on('response', async (r) => {
    const u = r.url();
    if (!/localhost:4173\/[^/]*$/.test(u) && !/\.(js|css|png|woff2?|svg|json$)/.test(u) === false) return;
    if (/localhost:3010|api/i.test(u)) {
      let body = '';
      try { body = (await r.text()).slice(0, 300); } catch { /* ignore */ }
      reqs.push(`${r.status()} ${r.request().method()} ${u} :: ${body}`);
    }
  });

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
  await s.page.waitForTimeout(6000);
  const dlg = s.page.getByRole('dialog');
  await dlg.locator('[role="option"]').first().click();
  await s.page.waitForTimeout(500);
  console.log('alert before:', JSON.stringify(await dlg.locator('[role="alert"]').allTextContents().catch(() => [])));
  const hire = dlg.getByRole('button', { name: /^Hire$/i });
  await hire.click();
  await s.page.waitForTimeout(6000);
  console.log('dialog still open?', await dlg.count());
  console.log('alert after:', JSON.stringify(await dlg.locator('[role="alert"]').allTextContents().catch(() => [])));
  console.log('\n--- API responses ---');
  console.log(reqs.join('\n'));
  console.log('\n--- console/page errors ---');
  console.log(logs.join('\n'));
  await s.shot('46-after-hire-diag');
  await s.decide('Diagnosed the failed hire: captured API responses, console errors and the dialog alert after pressing Hire.');
} catch (e) {
  await s.shot('46-error');
  await s.decide(`Step 46 blocked: ${e.message}`);
} finally {
  await s.close();
}
