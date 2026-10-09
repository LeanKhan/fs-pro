// P02 step 48: Recruitment tab — inspect market, try to sign/act on a player.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  const reqs = [];
  s.page.on('response', async (r) => {
    const u = r.url();
    if (/localhost:3010\/api\/(transfers|players|managers)/i.test(u)) {
      let body = ''; try { body = (await r.text()).slice(0, 240); } catch {}
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
  await drawer.getByRole('button', { name: 'Recruitment', exact: true }).first().click();
  await s.page.waitForTimeout(4000);
  await s.shot('48-recruitment');
  const rows = await drawer.locator('table tbody tr').count().catch(() => -1);
  const headers = await drawer.locator('table thead th').allTextContents().catch(() => []);
  console.log('rows:', rows, 'headers:', JSON.stringify(headers));
  const btns = await drawer.locator('table tbody button').allTextContents().catch(() => []);
  console.log('row buttons:', JSON.stringify(btns.slice(0, 20)));

  // First market row: click its action (eye = details).
  const firstRowBtn = drawer.locator('table tbody tr').first().locator('button').first();
  console.log('first row btn count:', await firstRowBtn.count().catch(() => -1));
  if (await firstRowBtn.count()) {
    await firstRowBtn.click({ force: true }).catch((e) => console.log('rowbtn click fail', e.message));
    await s.page.waitForTimeout(3000);
    await s.shot('48-player-details');
    console.log('\n===== AFTER FIRST ROW ACTION =====');
    console.log(await s.ariaSnapshot());
  }
  console.log('\n--- API ---\n' + reqs.join('\n'));
  await s.decide('Opened Recruitment and acted on the first market row to test whether a normal player can inspect/sign (the "Build a squad" step).');
} catch (e) {
  await s.shot('48-error');
  await s.decide(`Step 48 blocked: ${e.message}`);
} finally {
  await s.close();
}
