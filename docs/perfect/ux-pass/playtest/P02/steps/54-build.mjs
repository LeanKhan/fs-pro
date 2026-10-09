// P02 step 54: Build dock -> facility list/placement, try starting a build.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const out = {};
const s = await personaContext('P02');
try {
  const reqs = [];
  s.page.on('response', async (r) => {
    const u = r.url();
    if (/localhost:3010\/api\/(facilities|build|assets|program)/i.test(u)) {
      let body = ''; try { body = (await r.text()).slice(0, 200); } catch {}
      reqs.push(`${r.status()} ${r.request().method()} ${u} :: ${body}`);
    }
  });
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const lg = s.page.getByRole('button', { name: /Let's go/i });
  if (await lg.count().catch(() => 0)) { await lg.first().click({ timeout: 5000 }).catch(() => {}); await s.page.waitForTimeout(700); }

  await s.page.getByRole('button', { name: /^Build$/ }).first().click({ timeout: 8000 }).catch((e) => { out.buildErr = e.message; });
  await s.page.waitForTimeout(2500);
  await s.shot('54-build');
  out.buildAria = (await s.ariaSnapshot()).slice(0, 3000);

  // Try to click the first facility option / build button.
  const cand = s.page.getByRole('button', { name: /build|upgrade|place|construct/i }).first();
  out.candidateCount = await cand.count().catch(() => 0);
  if (out.candidateCount) {
    await cand.click({ timeout: 6000 }).catch((e) => { out.candErr = e.message; });
    await s.page.waitForTimeout(2500);
    await s.shot('54-build-click');
    out.after = (await s.page.locator('body').innerText().catch(() => '')).slice(0, 1500);
  }
  out.api = reqs;
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P02/steps/54-out.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await s.decide('Opened Build to see facility costs/options and whether a normal owner can start a build while the program is blocked on the manager step.');
} catch (e) {
  out.error = e.message;
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P02/steps/54-out.json', JSON.stringify(out, null, 2));
  await s.shot('54-error');
  await s.decide(`Step 54 blocked: ${e.message}`);
} finally {
  await s.close();
}
