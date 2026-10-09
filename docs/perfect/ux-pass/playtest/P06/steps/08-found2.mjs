// P06 step 08 — found the club: click "Next: your club" and walk the steps.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(3000);
  await s.shot('11-start-map');

  // Wait a bit to see if the map finishes unrolling.
  await s.page.waitForTimeout(6000);
  const unrolling = await s.page.getByText('Unrolling the map').count().catch(() => 0);
  console.log(`[map] "Unrolling the map…" present after 9s: ${unrolling}`);
  await s.shot('12-start-map-after-wait');
  await s.decide(`World map still showed "Unrolling the map…" after ~9s (${unrolling} nodes).`);

  const next = s.page.getByRole('button', { name: /Next: your club/ });
  await next.click();
  await s.page.waitForTimeout(2500);
  await s.shot('13-found-step2');
  const aria = await s.ariaSnapshot();
  console.log(`[url] ${s.page.url()}`);
  console.log('[aria] ------------------------------------------------');
  console.log(aria);
  console.log('------------------------------------------------------');
  await s.decide(`Founding: clicked "Next: your club" -> ${s.page.url()}.`);
} finally {
  await s.close();
}
