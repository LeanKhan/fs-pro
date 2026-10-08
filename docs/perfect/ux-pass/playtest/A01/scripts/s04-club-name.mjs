import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(2500);
  // /start resets to the Home step; advance to Club first.
  await s.page.getByRole('button', { name: /Next: your club/i }).click();
  await s.page.waitForTimeout(1500);
  // Step 2 is open; fill the club identity.
  await s.page.getByRole('textbox', { name: 'Club name' }).fill('Playtest Admin FC');
  await s.page.getByRole('textbox', { name: 'Code' }).fill('ADM');
  await s.page.getByRole('textbox', { name: 'Ground' }).fill('Playtest Park');
  await s.page.waitForTimeout(500);
  await s.shot('05-club-named');
  const next = s.page.getByRole('button', { name: /Next: kick-off/i });
  console.log('[A01] kickoff enabled=', await next.isEnabled());
  await s.decide('Filled the admin club identity (Playtest Admin FC/ADM/Playtest Park).');
  await next.click();
  await s.page.waitForTimeout(2000);
  console.log('[A01] url=', s.page.url());
  await s.shot('06-kickoff-step');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide('Advanced to the kick-off step of founding.');
} finally {
  await s.close();
}
