import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('06-diag');
} catch (e) {
  await s.shot('06-diag-error');
  console.log('ERR', e.message);
} finally {
  await s.close();
}
