// P06 step 11 — complete founding in one continuous script.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(3500);

  const next1 = s.page.getByRole('button', { name: /Next: your club/ });
  await next1.waitFor({ state: 'visible', timeout: 30_000 });
  await next1.click();
  await s.page.waitForTimeout(2500);

  await s.page.getByRole('textbox', { name: 'Club name' }).waitFor({ state: 'visible', timeout: 20_000 });
  await s.page.getByRole('textbox', { name: 'Club name' }).fill('Lowend United');
  await s.page.getByRole('textbox', { name: /Ground/ }).fill('Lowend Park');
  await s.page.getByRole('textbox', { name: 'Code' }).fill('LOW');
  await s.page.waitForTimeout(700);
  const enabled = await s.page.getByRole('button', { name: /Next: kick-off/ }).isEnabled();
  console.log(`[form] kick-off enabled: ${enabled}`);
  await s.shot('17-club-form-filled');

  await s.page.getByRole('button', { name: /Next: kick-off/ }).click();
  // Wait for the campus / next route.
  await s.page.waitForTimeout(8000);
  await s.shot('18-after-kickoff');
  console.log(`[url] ${s.page.url()}`);
  const aria = await s.ariaSnapshot();
  console.log('[aria] ------------------------------------------------');
  console.log(aria.slice(0, 4000));
  console.log('------------------------------------------------------');
  await s.decide(`Founded Lowend United (LOW, Lowend Park); after kick-off url=${s.page.url()}, kickoff-enabled=${enabled}.`);
} finally {
  await s.close();
}
