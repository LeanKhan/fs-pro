// P02 step 53: dismiss modal then tour League, Challenges, World, Settings.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const out = {};
const s = await personaContext('P02');
async function killModal() {
  const lg = s.page.getByRole('button', { name: /Let's go/i });
  if (await lg.count().catch(() => 0)) { await lg.first().click({ timeout: 5000 }).catch(() => {}); await s.page.waitForTimeout(700); }
}
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  await killModal();

  for (const name of ['League', 'Challenges', 'World', 'Settings']) {
    await killModal();
    const btn = s.page.getByRole('button', { name, exact: true }).first();
    const c = await btn.count().catch(() => 0);
    out[name + '_count'] = c;
    if (!c) continue;
    await btn.click({ timeout: 8000 }).catch((e) => { out[name + '_err'] = e.message; });
    await s.page.waitForTimeout(3000);
    await killModal();
    await s.shot('53-' + name.toLowerCase());
    out[name] = (await s.page.locator('body').innerText().catch(() => '')).slice(0, 1800);
    // Close any drawer/overlay before the next screen.
    const close = s.page.getByRole('button', { name: 'Close' }).first();
    if (await close.count().catch(() => 0)) { await close.click({ timeout: 4000 }).catch(() => {}); }
    await s.page.waitForTimeout(800);
  }
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P02/steps/53-out.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await s.decide('Toured League, Challenges, World and Settings to compare information density across the club screens.');
} catch (e) {
  out.error = e.message;
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P02/steps/53-out.json', JSON.stringify(out, null, 2));
  await s.shot('53-error');
  await s.decide(`Step 53 blocked: ${e.message}`);
} finally {
  await s.close();
}
