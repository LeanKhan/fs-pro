// P06 step 07 — continue founding: open the app, read the current founding step.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(3500);
  console.log(`[url] ${s.page.url()}`);
  await s.shot('10-found-after-reload');
  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria);
  console.log('------------------------------------------------------');
  await s.decide(`Reloaded app while logged in; landed on ${s.page.url()}.`);
} finally {
  await s.close();
}
