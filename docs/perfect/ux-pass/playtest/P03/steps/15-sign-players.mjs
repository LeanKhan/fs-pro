// P03 step 15 — sign 10 cheapest outfield players (loop, agent-decided).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) { await owner.click({ force: true }).catch(()=>{}); await s.page.waitForTimeout(1500); }
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(1200); }
  const squadTab = s.page.getByRole('tab', { name: 'Squad' }).or(s.page.getByRole('button', { name: /^Squad / }));
  await squadTab.first().click().catch(()=>{});
  await s.page.waitForTimeout(800);
  // exclude the GK filter; use ALL cheapest
  await s.page.getByRole('button', { name: 'ALL' }).click().catch(()=>{});
  await s.page.getByRole('button', { name: 'Cheapest' }).click().catch(()=>{});
  await s.page.waitForTimeout(800);
  for (let i = 0; i < 10; i++) {
    const card = s.page.locator('article').first();
    const txt = (await card.innerText()).replace(/\s+/g,' ');
    // skip the obvious test artifact and outfield only (no GK needed beyond 1)
    if (/PgTest/i.test(txt)) {
      // sign it anyway? no - pick next cheapest real player by signing second
      const card2 = s.page.locator('article').nth(1);
      console.log(`[${i}] skipping test artifact; taking:`, (await card2.innerText()).replace(/\s+/g,' ').slice(0,80));
      await card2.getByRole('button', { name: 'Sign' }).click();
    } else {
      console.log(`[${i}] signing:`, txt.slice(0,90));
      await card.getByRole('button', { name: 'Sign' }).click();
    }
    await s.page.waitForTimeout(800);
    if (i === 0) { await s.shot('15-player-terms'); }
    const confirm = s.page.getByRole('button', { name: /Sign for V/ });
    if (await confirm.count()) { await confirm.click(); await s.page.waitForTimeout(1400); }
    else { await s.shot(`15-noconfirm-${i}`); }
  }
  await s.shot('15-squad-signed10');
  await s.decide('Signed 10 cheapest outfield free agents to complete the 11.');
} catch (e) {
  await s.shot('15-error');
  await s.decide(`Batch sign players failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
