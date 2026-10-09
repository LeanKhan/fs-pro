// P06 step 01 — open the production client and capture the landing screen.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  const t0 = Date.now();
  try {
    await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  } catch (err) {
    console.warn(`[nav] warning: ${err.message}`);
  }
  const domMs = Date.now() - t0;
  console.log(`[timing] domcontentloaded ${domMs} ms (Slow 4G + CPU 4x)`);
  await s.page.waitForTimeout(2500);
  await s.shot('01-landing');
  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria);
  console.log('------------------------------------------------------');
  await s.decide(`Session 1 start. Landing loaded (domcontentloaded ${domMs} ms on Slow 4G/CPU4x). Read a11y tree to find registration.`);
} finally {
  await s.close();
}
