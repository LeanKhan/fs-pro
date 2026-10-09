// P02 step 55: select a facility in Build, start the build, observe cost/time.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const out = {};
const s = await personaContext('P02');
try {
  const reqs = [];
  s.page.on('response', async (r) => {
    const u = r.url();
    if (/localhost:3010\/api\//i.test(u) && /facilit|build|upgrade|asset/i.test(u)) {
      let body = ''; try { body = (await r.text()).slice(0, 300); } catch {}
      reqs.push(`${r.status()} ${r.request().method()} ${u} :: ${body}`);
    }
  });
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const lg = s.page.getByRole('button', { name: /Let's go/i });
  if (await lg.count().catch(() => 0)) { await lg.first().click({ timeout: 5000 }).catch(() => {}); await s.page.waitForTimeout(700); }
  await s.page.getByRole('button', { name: /^Build$/ }).first().click({ timeout: 8000 }).catch(() => {});
  await s.page.waitForTimeout(2500);
  await s.shot('55-build-modal');

  const pitch = s.page.getByRole('button', { name: /Dirt Pitch/i }).first();
  out.pitchCount = await pitch.count().catch(() => 0);
  await pitch.click({ timeout: 8000 }).catch((e) => { out.pitchErr = e.message; });
  await s.page.waitForTimeout(2000);
  await s.shot('55-build-confirm');
  out.confirmText = (await s.page.locator('body').innerText().catch(() => '')).slice(0, 1800);
  out.confirmAria = (await s.ariaSnapshot()).slice(0, 2500);

  // Look for a confirm/build button.
  const confirm = s.page.getByRole('button', { name: /^(Build|Upgrade|Confirm|Start|Yes)/i }).first();
  out.confirmCount = await confirm.count().catch(() => 0);
  if (out.confirmCount) {
    await confirm.click({ timeout: 6000 }).catch((e) => { out.confirmErr = e.message; });
    await s.page.waitForTimeout(3000);
    await s.shot('55-build-after');
    out.after = (await s.page.locator('body').innerText().catch(() => '')).slice(0, 1200);
  }
  out.api = reqs;
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P02/steps/55-out.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await s.decide('Selected the Stadium Grounds facility and started the build to observe cost, duration and whether it advances progress.');
} catch (e) {
  out.error = e.message;
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P02/steps/55-out.json', JSON.stringify(out, null, 2));
  await s.shot('55-error');
  await s.decide(`Step 55 blocked: ${e.message}`);
} finally {
  await s.close();
}
