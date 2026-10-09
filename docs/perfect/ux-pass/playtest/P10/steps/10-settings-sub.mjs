// P10 step 10: walk Settings sub-pages: Account, Manager hub, Year calendar & history.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
const openSettings = async () => {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/ });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }
  await s.page.getByRole('button', { name: 'Settings' }).click();
  await s.page.waitForTimeout(1500);
};
try {
  for (const [name, tag] of [['Account', '10a-account'], ['Manager hub', '10b-managerhub'], ['Year calendar & history', '10c-calendar']]) {
    await openSettings();
    await s.page.getByRole('button', { name: new RegExp('^' + name.replace(/[&]/g, '\\&')) }).click();
    await s.page.waitForTimeout(2500);
    await s.shot(tag);
    const aria = await s.ariaSnapshot();
    dump(tag, aria);
    console.log(`=== ${tag} URL ===`, s.page.url());
    console.log(aria);
    await s.decide(`Opened Settings > ${name}; captured it.`);
  }
} finally {
  await s.close();
  process.exit(0);
}
