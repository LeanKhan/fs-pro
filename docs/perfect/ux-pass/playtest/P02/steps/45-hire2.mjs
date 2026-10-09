// P02 step 45: quantify manager-list duplicates, then hire the first candidate.
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
  await s.page.waitForTimeout(6000);

  const dlg = s.page.getByRole('dialog');
  // The candidate options are role=option inside the scroll list (2nd column).
  const opts = await dlg.locator('.v-list[style] [role="option"] .v-list-item-title').allTextContents().catch(() => []);
  const names = opts.map((t) => t.trim()).filter(Boolean);
  const uniq = [...new Set(names)];
  console.log(`candidates=${names.length} unique=${uniq.length}`);
  console.log('first 30:', JSON.stringify(names.slice(0, 30)));
  const counts = {};
  for (const n of names) counts[n] = (counts[n] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('top repeats:', JSON.stringify(top));

  // Select the first candidate and hire.
  const first = dlg.locator('[role="option"]').first();
  await first.click().catch((e) => console.log('select fail', e.message));
  await s.page.waitForTimeout(800);
  await s.shot('45-manager-selected');
  // Fill the Details note if it accepts text.
  const note = dlg.getByRole('textbox');
  if (await note.count()) { await note.first().fill('Veteran owner — building from the ground up.').catch(() => {}); }

  const hireBtn = dlg.getByRole('button', { name: /^Hire$/i });
  console.log('hire disabled?', await hireBtn.isDisabled().catch(() => 'unknown'));
  await hireBtn.click().catch((e) => console.log('hire click fail', e.message));
  await s.page.waitForTimeout(4000);
  await s.shot('45-after-hire');
  console.log('\n===== AFTER HIRE =====');
  console.log(await s.ariaSnapshot());
  await s.decide('Hired the first candidate from the manager dialog; checking whether the Owner\'s Program step advances.');
} catch (e) {
  await s.shot('45-error');
  await s.decide(`Step 45 blocked: ${e.message}`);
} finally {
  await s.close();
}
