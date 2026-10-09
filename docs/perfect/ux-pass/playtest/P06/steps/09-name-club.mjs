// P06 step 09 — name the club and kick off.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(3000);

  await s.page.getByRole('textbox', { name: 'Club name' }).fill('Lowend United');
  await s.page.getByRole('textbox', { name: /Ground/ }).fill('Lowend Park');
  // Code field: try 3 letters.
  const code = s.page.getByRole('textbox', { name: 'Code' });
  await code.fill('LOW');
  await s.page.waitForTimeout(600);
  const state = await s.page.getByRole('button', { name: /Next: kick-off/ }).isEnabled();
  console.log(`[form] Next: kick-off enabled after fill: ${state}`);
  await s.shot('14-club-named');

  await s.page.getByRole('button', { name: /Next: kick-off/ }).click();
  await s.page.waitForTimeout(5000);
  await s.shot('15-after-kickoff');
  const aria = await s.ariaSnapshot();
  console.log(`[url] ${s.page.url()}`);
  console.log('[aria] ------------------------------------------------');
  console.log(aria.slice(0, 3000));
  console.log('------------------------------------------------------');
  await s.decide(`Named club Lowend United (LOW, Lowend Park); clicked kick-off -> ${s.page.url()}.`);
} finally {
  await s.close();
}
