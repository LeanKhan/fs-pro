// A01 Session 2, step 26: open a competition and inspect its editions.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 140) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/a/competitions', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4500);
  await s.page.getByRole('link', { name: 'Open' }).first().click();
  await s.page.waitForTimeout(4500);
  console.log('[url]', s.page.url());
  await s.shot('52-s2-competition-open', { fullPage: true });
  console.log('-----ARIA open (main)-----');
  const aria = await s.ariaSnapshot();
  const mainIdx = aria.indexOf('- main:');
  console.log(trim(aria.slice(mainIdx), 130));
  console.log('-----END-----');
  await s.decide(`Session 2: opened competition detail ${s.page.url()} to inspect editions.`);
} finally {
  await s.close();
}
