// P01 resumed step 14 — reconnect, dismiss modals, report campus status.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('s02-19-recon');
  await s.decide('Reconnected after another server restart; capturing campus state to resume.');
} catch (e) {
  await s.shot('s02-error14');
  await s.decide(`Reconnect failed: ${e.message}`);
} finally {
  await s.close();
}
