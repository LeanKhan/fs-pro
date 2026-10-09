// P06 step 03 — scroll check on the join form, then register playtestP06.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(`${s.url}/auth/join`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(1500);

  // See the bottom of the form (footer overlap check).
  await s.page.mouse.wheel(0, 1200);
  await s.page.waitForTimeout(800);
  await s.shot('03-join-bottom');

  // Fill the form.
  await s.page.getByRole('textbox', { name: 'Your name' }).fill('Casey Lowend');
  await s.page.getByRole('textbox', { name: /Email to confirm/ }).fill('playtestP06@example.com');
  await s.page.getByRole('textbox', { name: /Username/ }).fill('playtestP06');
  await s.page.getByRole('textbox', { name: /^Password at least/ }).fill('Playtest-P06-2026!');
  await s.page.getByRole('textbox', { name: /Password again/ }).fill('Playtest-P06-2026!');
  await s.page.waitForTimeout(400);
  await s.shot('04-join-filled');

  const t0 = Date.now();
  await s.page.getByRole('button', { name: 'Create account' }).click();
  // wait for either a navigation or an error message
  await s.page.waitForTimeout(4000);
  const createMs = Date.now() - t0;
  await s.shot('05-join-after-submit');
  const aria = await s.ariaSnapshot();
  console.log(`[timing] create-account -> ${createMs} ms, url=${s.page.url()}`);
  console.log('[aria] ------------------------------------------------');
  console.log(aria);
  console.log('------------------------------------------------------');
  await s.decide(`Registered playtestP06 (Casey Lowend). After submit: url=${s.page.url()} (${createMs} ms).`);
} finally {
  await s.close();
}
