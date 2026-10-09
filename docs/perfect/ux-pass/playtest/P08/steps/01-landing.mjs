// P08 step 01 — open the client cold and look for the invite/entry path.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  console.log('URL:', s.page.url());
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.shot('01-landing');
  await s.decide('Opened the client at the plain URL (no invite link was ever given to me). Looked for any invite/join-by-link affordance on the landing screen.');
} catch (e) {
  await s.shot('01-landing-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
