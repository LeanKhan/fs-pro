// P02 step 49: try the PLAY (quick match) flow with an empty squad.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  const reqs = [];
  s.page.on('response', async (r) => {
    const u = r.url();
    if (/localhost:3010\/api\/(play|match|sim)/i.test(u)) {
      let body = ''; try { body = (await r.text()).slice(0, 200); } catch {}
      reqs.push(`${r.status()} ${r.request().method()} ${u} :: ${body}`);
    }
  });
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count()) { await letsGo.first().click().catch(() => {}); await s.page.waitForTimeout(600); }
  await s.shot('49-campus-preplay');
  const play = s.page.getByRole('button', { name: /^PLAY/ }).first();
  console.log('PLAY count', await play.count());
  await play.click().catch((e) => console.log('play click fail', e.message));
  await s.page.waitForTimeout(3000);
  await s.shot('49-after-play');
  console.log('\n===== AFTER PLAY =====');
  console.log(await s.ariaSnapshot());
  console.log('\n--- API ---\n' + reqs.join('\n'));
  await s.decide('Pressed PLAY on an empty squad to see whether a quick match is possible before signing players.');
} catch (e) {
  await s.shot('49-error');
  await s.decide(`Step 49 blocked: ${e.message}`);
} finally {
  await s.close();
}
