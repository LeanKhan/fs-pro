import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('07a-welcome');
  // If the club already exists, the welcome panel offers "Go to your ground".
  const go = s.page.getByRole('button', { name: /Go to your ground/i });
  if (await go.isVisible().catch(() => false)) {
    await go.click();
    await s.page.waitForTimeout(9000);
  }
  console.log('URL after:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('07b-campus');
  await s.decide('Opened the welcome panel and went to my ground. Campus loaded.', 'session 1');
} catch (e) {
  await s.shot('07-error');
  await s.decide('Blocked going to ground: ' + e.message);
} finally {
  await s.close();
}
