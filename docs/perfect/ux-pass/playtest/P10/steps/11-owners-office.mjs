// P10 step 11: walk every tab of the Owner's office drawer.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  const letsGo = s.page.getByRole('button', { name: /Let's go/ });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }

  // Open the drawer from the bottom dock "Manager".
  await s.page.getByRole('button', { name: 'Manager', exact: true }).click();
  await s.page.waitForTimeout(1800);
  await s.shot('11-owners-office-matchday');

  const tabs = ['Matchday', 'The brief', 'Squad', 'Recruitment', 'Owner', 'Analysis'];
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    const tag = `11${String.fromCharCode(97 + i)}-${t.toLowerCase().replace(/\s+/g, '-')}`;
    await s.page.getByRole('button', { name: t, exact: true }).click();
    await s.page.waitForTimeout(1800);
    await s.shot(tag);
    const aria = await s.ariaSnapshot();
    dump(tag, aria);
    console.log(`=== ${tag} (url ${s.page.url()}) ===`);
    console.log(aria);
    await s.decide(`Opened Owner's office tab "${t}"; captured it.`);
  }
} finally {
  await s.close();
  process.exit(0);
}
