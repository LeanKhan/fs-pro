// P02 step 42: tour the Owner's office tabs to find manager hire + squad screens.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count()) { await letsGo.first().click().catch(() => {}); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: /^Manager$/ }).first().click().catch(() => {});
  await s.page.waitForTimeout(1500);

  for (const tab of ['The brief', 'Squad', 'Owner', 'Analysis']) {
    const t = s.page.getByRole('button', { name: tab, exact: true }).first();
    await t.click().catch((e) => console.log('tab click failed', tab, e.message));
    await s.page.waitForTimeout(1500);
    const slug = tab.toLowerCase().replace(/\s+/g, '-');
    await s.shot(`42-tab-${slug}`);
    console.log(`\n===== TAB: ${tab} =====`);
    console.log(await s.ariaSnapshot());
  }
  await s.decide("Toured the Owner's office tabs (The brief / Squad / Owner / Analysis) to locate the manager hire and the squad views.");
} catch (e) {
  await s.shot('42-error');
  await s.decide(`Step 42 blocked: ${e.message}`);
} finally {
  await s.close();
}
