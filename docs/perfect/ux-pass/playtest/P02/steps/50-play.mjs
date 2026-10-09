// P02 step 50: play a quick match and observe result + XP.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  const reqs = [];
  s.page.on('response', async (r) => {
    const u = r.url();
    if (/localhost:3010\/api\//i.test(u) && !/\.(js|css|png|woff2?|svg)/.test(u)) {
      let body = ''; try { body = (await r.text()).slice(0, 180); } catch {}
      reqs.push(`${r.status()} ${r.request().method()} ${u} :: ${body}`);
    }
  });
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count()) { await letsGo.first().click().catch(() => {}); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: /^PLAY/ }).first().click();
  await s.page.waitForTimeout(2500);
  await s.page.getByRole('button', { name: /Play now/i }).first().click();
  await s.page.waitForTimeout(3000);
  await s.shot('50-match-loading');
  console.log('after Play now URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  // wait for the match to resolve
  for (let i = 0; i < 8; i++) {
    await s.page.waitForTimeout(5000);
    const body = await s.page.locator('body').innerText().catch(() => '');
    if (/result|final score|man of the match|won|lost|drew/i.test(body)) break;
  }
  await s.shot('50-match-result', { fullPage: true });
  console.log('\n===== MATCH SCREEN =====');
  console.log((await s.page.locator('body').innerText().catch(() => '')).slice(0, 4000));
  console.log('\n--- API ---\n' + reqs.join('\n'));
  await s.decide('Played a quick match (Play now) against another human club to observe the match screen, result and XP.');
} catch (e) {
  await s.shot('50-error');
  await s.decide(`Step 50 blocked: ${e.message}`);
} finally {
  await s.close();
}
