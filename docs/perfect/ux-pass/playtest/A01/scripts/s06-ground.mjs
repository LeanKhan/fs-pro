import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4000);
  await s.shot('08-welcome-world');
  const go = s.page.getByRole('button', { name: /Go to your ground/i });
  if (await go.count()) {
    await s.decide('Club born welcome screen; clicked "Go to your ground".');
    await go.click();
  } else {
    await s.decide('No welcome screen; navigating directly (already founded).');
  }
  await s.page.waitForTimeout(7000);
  console.log('[A01] url=', s.page.url());
  console.log('[A01] title=', await s.page.title());
  await s.shot('09-ground');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide(`Entered the ground; landed on ${s.page.url()}.`);
} finally {
  await s.close();
}
