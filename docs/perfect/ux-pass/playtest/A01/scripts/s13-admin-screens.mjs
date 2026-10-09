import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 90) => t.split('\n').slice(0, n).join('\n');
try {
  await s.page.goto(s.url + '/a/clubs', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(7000);
  console.log('[A01] clubs url=', s.page.url());
  await s.shot('19-clubs');
  console.log('-----CLUBS ARIA (head)-----');
  console.log(trim(await s.ariaSnapshot(), 70));
  console.log('-----END-----');
  await s.decide('Surveyed admin Clubs screen.');

  await s.page.getByRole('listitem').filter({ hasText: 'Players' }).first().click();
  await s.page.waitForTimeout(5000);
  console.log('[A01] players url=', s.page.url());
  await s.shot('20-players');
  console.log('-----PLAYERS ARIA (head)-----');
  console.log(trim(await s.ariaSnapshot(), 80));
  console.log('-----END-----');

  await s.page.getByRole('listitem').filter({ hasText: 'Managers' }).first().click();
  await s.page.waitForTimeout(5000);
  console.log('[A01] managers url=', s.page.url());
  await s.shot('21-managers');
  console.log('-----MANAGERS ARIA (head)-----');
  console.log(trim(await s.ariaSnapshot(), 80));
  console.log('-----END-----');
  await s.decide('Surveyed admin Players and Managers screens.');
} finally {
  await s.close();
}
