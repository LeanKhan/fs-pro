// P10 step 11 (continued): remaining Owner's office tabs, scoped to the drawer.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
const dump = (name, txt) => fs.writeFileSync(`${s.dir}\\ua-${name}.txt`, txt, 'utf8');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  const letsGo = s.page.getByRole('button', { name: /Let's go/ });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }
  await s.page.getByRole('button', { name: 'Manager', exact: true }).click();
  await s.page.waitForTimeout(1500);

  const drawers = s.page.getByRole('complementary');
  console.log('complementary count:', await drawers.count());
  const drawer = drawers.last();
  const tabs = [['Squad', '11c-squad'], ['Recruitment', '11d-recruitment'], ['Owner', '11e-owner'], ['Analysis', '11f-analysis']];
  for (const [t, tag] of tabs) {
    await drawer.getByRole('button', { name: t, exact: true }).click();
    await s.page.waitForTimeout(2000);
    await s.shot(tag);
    const aria = await s.ariaSnapshot();
    dump(tag, aria);
    console.log(`=== ${tag} (url ${s.page.url()}) ===`);
    console.log(aria);
    await s.decide(`Opened Owner's office tab "${t}"; captured it.`);
  }
} catch (e) {
  console.log('ERROR:', e && e.message);
  try { await s.shot('11-error'); } catch {}
} finally {
  await s.close();
  process.exit(0);
}
