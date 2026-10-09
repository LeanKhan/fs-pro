// P10 step 05: complete the founding flow in one session (Club -> Kick-off -> Found).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);

  // Step 1 -> 2
  await s.page.getByRole('button', { name: /Next: your club/ }).click();
  await s.page.waitForTimeout(1000);

  // Fill club identity
  await s.page.getByRole('textbox', { name: 'Club name' }).fill('Completionist FC');
  await s.page.getByRole('textbox', { name: 'Code' }).fill('CMP');
  await s.page.getByRole('textbox', { name: 'Ground (stadium name)' }).fill('The Archive');
  await s.page.waitForTimeout(500);
  const nameVal = await s.page.getByRole('textbox', { name: 'Club name' }).inputValue();
  console.log('club name value:', nameVal);
  await s.shot('05-club-filled');

  const nextBtn = s.page.getByRole('button', { name: /Next: kick-off/ });
  console.log('next enabled:', await nextBtn.isEnabled());
  await nextBtn.click();
  await s.page.waitForTimeout(1500);
  await s.shot('05b-kickoff');
  const ariaKick = await s.ariaSnapshot();
  dump('05-kickoff', ariaKick);
  console.log('=== URL ===', s.page.url());
  console.log('--- KICKOFF ---');
  console.log(ariaKick);

  await s.decide('Filled club identity (Completionist FC / CMP / The Archive) and reached the Kick-off step; captured it.');
} finally {
  await s.close();
}
