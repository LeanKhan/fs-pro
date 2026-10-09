// P10 step 06: found the club and capture the first campus view.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  console.log('after goto url', s.page.url());

  // If already founded, we land on the campus directly.
  if (!s.page.url().includes('/start')) {
    await s.shot('06-campus-already');
    const a = await s.ariaSnapshot();
    dump('06-campus', a);
    console.log(a);
    await s.decide('Account already has a club; landed on campus.');
  } else {
    await s.page.getByRole('button', { name: /Next: your club/ }).click();
    await s.page.waitForTimeout(800);
    await s.page.getByRole('textbox', { name: 'Club name' }).fill('Completionist FC');
    await s.page.getByRole('textbox', { name: 'Code' }).fill('CMP');
    await s.page.getByRole('textbox', { name: 'Ground (stadium name)' }).fill('The Archive');
    await s.page.getByRole('button', { name: /Next: kick-off/ }).click();
    await s.page.waitForTimeout(1200);
    await s.page.getByRole('button', { name: /^Found Completionist FC/ }).click();
    await s.page.waitForTimeout(6000);
    await s.shot('06-after-found');
    const a = await s.ariaSnapshot();
    dump('06-after-found', a);
    console.log('=== URL ===', s.page.url());
    console.log(a);
    await s.decide('Clicked "Found Completionist FC"; captured the result.');
  }
} finally {
  await s.close();
}
