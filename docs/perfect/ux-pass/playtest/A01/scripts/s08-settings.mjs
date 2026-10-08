import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  await s.page.goto(s.url + '/game/f5fd144a-0904-4cad-8020-f9d9e237f0b8', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(7000);
  const letsGo = s.page.getByRole('button', { name: /Let's go!/i });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }
  await s.shot('11-shell-clean');
  // Settings via the gear button in the top bar.
  const gear = s.page.getByRole('button', { name: /Settings/i });
  console.log('[A01] settingsBtn count=', await gear.count());
  if (await gear.count()) {
    await gear.first().click();
    await s.page.waitForTimeout(2500);
  }
  console.log('[A01] url=', s.page.url());
  await s.shot('12-settings');
  console.log('-----ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END ARIA-----');
  await s.decide('Dismissed welcome, opened Settings to look for admin/world controls.');
} finally {
  await s.close();
}
