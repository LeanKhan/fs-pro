import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('01-landing');
  await s.decide('Opened the client landing page for the first time as P07 (1280x800, English as a second language).');
} catch (e) {
  await s.shot('01-error');
  await s.decide('Blocked opening landing: ' + e.message);
} finally {
  await s.close();
}
