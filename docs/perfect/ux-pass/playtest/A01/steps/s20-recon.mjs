// A01 Session 2, step 20: confirm session/login and reach the admin console.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 60) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4000);
  console.log('[url]', s.page.url());
  await s.shot('40-s2-landing');
  console.log('-----ARIA (head)-----');
  console.log(trim(await s.ariaSnapshot(), 50));
  console.log('-----END-----');
  await s.decide(`Session 2 recon: opened client at ${s.page.url()}.`);
} finally {
  await s.close();
}
