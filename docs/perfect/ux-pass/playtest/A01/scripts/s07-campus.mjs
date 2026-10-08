import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(3500);
  const back = s.page.getByRole('button', { name: /Back to my club/i });
  console.log('[A01] backToClub count=', await back.count());
  if (await back.count()) {
    await back.click();
    await s.decide('Clicked "Back to my club" from the founding screen.');
  }
  await s.page.waitForTimeout(8000);
  console.log('[A01] url=', s.page.url());
  await s.shot('10-campus');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide(`In the club shell; landed on ${s.page.url()}.`);
} finally {
  await s.close();
}
