// P01 resumed session — reconnect and see where the campus is.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('s02-01-resume');
  await s.decide('Resumed after outage: opened the client; checking where I landed.');
} catch (e) {
  await s.shot('s02-error');
  await s.decide(`Blocked at resume: ${e.message}`);
} finally {
  await s.close();
}
