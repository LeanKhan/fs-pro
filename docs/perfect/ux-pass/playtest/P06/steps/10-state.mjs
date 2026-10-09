// P06 step 10 — check where the founding flow is now.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(4000);
  console.log(`[url] ${s.page.url()}`);
  await s.shot('16-found-state');
  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria.slice(0, 2500));
  console.log('------------------------------------------------------');
  await s.decide(`Re-checked founding state: url=${s.page.url()}.`);
} finally {
  await s.close();
}
