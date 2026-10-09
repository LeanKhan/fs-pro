// P03 step 22 — Owner's office: finances/money screens.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const money = (aria) => aria.split('\n').filter(l => /V[\d,.]+|wage|Wage|income|Income|balance|Balance|gate|Gate|fee|Fee|budget|Budget|XP/i.test(l)).slice(0, 40).join('\n');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  const squadDock = s.page.getByRole('button', { name: 'Squad', exact: true });
  await squadDock.first().click();
  await s.page.waitForTimeout(2500);
  console.log('===== OFFICE DEFAULT =====');
  console.log(money(await s.ariaSnapshot()));
  await s.shot('22-office-default');
  for (const tab of ['Owner', 'Analysis', 'The brief', 'Recruitment']) {
    const t = s.page.getByRole('button', { name: tab, exact: true });
    if (await t.count()) {
      await t.first().click();
      await s.page.waitForTimeout(1600);
      await s.shot(`22-office-${tab.replace(/\s+/g,'-').toLowerCase()}`);
      console.log(`===== ${tab} =====`);
      console.log(money(await s.ariaSnapshot()));
    }
  }
  await s.decide("Explored the Owner's office tabs for money screens.");
} catch (e) {
  await s.shot('22-error');
  await s.decide(`Owner's office failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
