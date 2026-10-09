// P05 resume check: verify the preserved login and see where we are.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  console.log(`URL=${s.page.url()}`);
  const snap = await s.ariaSnapshot();
  console.log('=== ARIA ================================================');
  console.log(snap);
  console.log('=== END =================================================');
  console.log(`shot=${await s.shot('25-resume-campus')}`);
  await s.decide('Resumed after the interop/API outage; login still valid, landed on the campus.');
} finally {
  await s.close();
}
