// P02 step 51: enumerate tactics options (formation + playing style) on the Team Sheet.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count()) { await letsGo.first().click().catch(() => {}); await s.page.waitForTimeout(600); }
  // Open Team Sheet via dock.
  await s.page.getByRole('button', { name: /^Team Sheet$/ }).first().click().catch(() => {});
  await s.page.waitForTimeout(2500);
  await s.shot('51-teamsheet');

  const drawer = s.page.locator('aside.drawer');
  const combos = drawer.getByRole('combobox');
  console.log('combobox count', await combos.count());
  const labels = await combos.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent.trim())).catch(() => []);
  console.log('combos:', JSON.stringify(labels));

  // Open the first combobox (Formation).
  await combos.nth(0).click().catch((e) => console.log('combo0 fail', e.message));
  await s.page.waitForTimeout(1200);
  let opts = await s.page.getByRole('option').allTextContents().catch(() => []);
  console.log('FORMATION options (' + opts.length + '):', JSON.stringify(opts));
  await s.shot('51-formation-options');
  await s.page.keyboard.press('Escape').catch(() => {});
  await s.page.waitForTimeout(600);

  // Open the second combobox (Playing Style).
  await combos.nth(1).click().catch((e) => console.log('combo1 fail', e.message));
  await s.page.waitForTimeout(1200);
  opts = await s.page.getByRole('option').allTextContents().catch(() => []);
  console.log('STYLE options (' + opts.length + '):', JSON.stringify(opts));
  await s.shot('51-style-options');
  await s.page.keyboard.press('Escape').catch(() => {});
  await s.page.waitForTimeout(600);

  // Read the empty-slot placeholders to see if roles/instructions are exposed.
  const slots = await drawer.locator('text=/Pick /').allTextContents().catch(() => []);
  console.log('slots:', JSON.stringify(slots));
  await s.decide('Enumerated the Team Sheet tactics options (formation, playing style, role slots) to judge tactical depth versus Football Manager.');
} catch (e) {
  await s.shot('51-error');
  await s.decide(`Step 51 blocked: ${e.message}`);
} finally {
  await s.close();
}
