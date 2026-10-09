// P08 step 16 — commit search, zoom in to districts.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/world`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const search = s.page.getByRole('searchbox', { name: 'Search clubs and places' });
  await search.click();
  await search.type('Philamentia', { delay: 60 });
  await s.page.keyboard.press('Enter');
  await s.page.waitForTimeout(2000);
  await s.shot('16a-search-enter');
  console.log('--- after Enter ---');
  console.log(await s.ariaSnapshot());
  for (let i = 0; i < 3; i++) {
    await s.page.getByRole('button', { name: 'Zoom in' }).click();
    await s.page.waitForTimeout(1200);
  }
  await s.shot('16b-zoomed');
  console.log('--- after zoom ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Pressed Enter on the place search and zoomed the map in to try to reach district level.');
} catch (e) {
  await s.shot('16-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
