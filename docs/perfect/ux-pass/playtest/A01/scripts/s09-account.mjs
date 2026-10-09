import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/game/f5fd144a-0904-4cad-8020-f9d9e237f0b8', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: /Let's go!/i });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: /Settings/i }).first().click();
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('button', { name: /Account/i }).click();
  await s.page.waitForTimeout(2500);
  console.log('[A01] url=', s.page.url());
  await s.shot('13-account');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide('Opened Account from Settings to look for admin controls.');
} finally {
  await s.close();
}
