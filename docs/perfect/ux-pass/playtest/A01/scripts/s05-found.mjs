import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(2500);
  await s.page.getByRole('button', { name: /Next: your club/i }).click();
  await s.page.waitForTimeout(1200);
  await s.page.getByRole('textbox', { name: 'Club name' }).fill('Playtest Admin FC');
  await s.page.getByRole('textbox', { name: 'Code' }).fill('ADM');
  await s.page.getByRole('textbox', { name: 'Ground' }).fill('Playtest Park');
  await s.page.getByRole('button', { name: /Next: kick-off/i }).click();
  await s.page.waitForTimeout(1200);
  await s.decide('On the kick-off review step; about to found the admin club.');
  await s.page.getByRole('button', { name: /Found Playtest Admin FC/i }).click();
  await s.page.waitForTimeout(6000);
  console.log('[A01] url=', s.page.url());
  console.log('[A01] title=', await s.page.title());
  await s.shot('07-after-found');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide(`Founded the admin club; landed on ${s.page.url()}.`);
} finally {
  await s.close();
}
