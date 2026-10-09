// P03 step 03 — fill and submit registration.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/auth/join', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1200);
  await s.page.getByRole('textbox', { name: 'Your name' }).fill('P03 Economist');
  await s.page.getByRole('textbox', { name: /Email to confirm/ }).fill('p03.economist@fspro.playtest');
  await s.page.getByRole('textbox', { name: /Username 3-24/ }).fill('EconomistP03');
  await s.page.getByRole('textbox', { name: 'Password at least 8 characters' }).fill('Playtest-P03-2026!');
  await s.page.getByRole('textbox', { name: 'Password again' }).fill('Playtest-P03-2026!');
  await s.page.waitForTimeout(400);
  await s.shot('03-join-filled');
  await s.page.getByRole('button', { name: 'Create account' }).click();
  await s.page.waitForTimeout(3000);
  console.log('[url]', s.page.url());
  await s.shot('03-after-register');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide(`Submitted registration as EconomistP03 -> landed on ${s.page.url()}.`);
} catch (e) {
  await s.shot('03-error');
  await s.decide(`Blocked during register: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
