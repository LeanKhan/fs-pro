// P02 step 52: capture playing-style options + tour League. Writes results to JSON.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const out = {};
const s = await personaContext('P02');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count().catch(() => 0)) { await letsGo.first().click({ timeout: 5000 }).catch(() => {}); await s.page.waitForTimeout(600); }

  await s.page.getByRole('button', { name: /^Team Sheet$/ }).first().click({ timeout: 8000 }).catch(() => {});
  await s.page.waitForTimeout(2500);
  const drawer = s.page.locator('aside.drawer');
  const combos = drawer.getByRole('combobox');
  out.comboCount = await combos.count().catch(() => -1);
  // Open the second combo (Playing Style) explicitly by label/value "Balanced".
  const styleCombo = drawer.locator('.v-field', { hasText: 'Balanced' }).first();
  out.hasStyleCombo = await styleCombo.count().catch(() => 0);
  await styleCombo.click({ timeout: 6000 }).catch((e) => { out.styleClickErr = e.message; });
  await s.page.waitForTimeout(1500);
  out.styleOptions = await s.page.getByRole('option').allTextContents().catch(() => []);
  await s.shot('52-style-options');
  await s.page.keyboard.press('Escape').catch(() => {});
  await s.page.waitForTimeout(500);

  // Close the drawer.
  await drawer.getByRole('button', { name: 'Close' }).first().click({ timeout: 5000 }).catch(() => {});
  await s.page.waitForTimeout(1000);

  // League
  await s.page.getByRole('button', { name: /^League$/ }).first().click({ timeout: 8000 }).catch((e) => { out.leagueErr = e.message; });
  await s.page.waitForTimeout(3500);
  await s.shot('52-league');
  out.leagueAria = (await s.ariaSnapshot()).slice(0, 2500);
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P02/steps/52-out.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await s.decide('Captured Playing Style options and opened the League screen to inspect information density.');
} catch (e) {
  out.error = e.message;
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P02/steps/52-out.json', JSON.stringify(out, null, 2));
  await s.shot('52-error');
  await s.decide(`Step 52 blocked: ${e.message}`);
} finally {
  await s.close();
}
