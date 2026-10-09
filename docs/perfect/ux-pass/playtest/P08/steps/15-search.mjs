// P08 step 15 — search the world for my district.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/world`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const search = s.page.getByRole('searchbox', { name: 'Search clubs and places' });
  await search.click();
  await search.fill('Philamentia');
  await s.page.waitForTimeout(2500);
  await s.shot('15-search');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Searched the World for "Philamentia" to locate my town page.');
} catch (e) {
  await s.shot('15-search-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
