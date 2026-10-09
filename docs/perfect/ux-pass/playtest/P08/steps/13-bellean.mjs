// P08 step 13 — Bellean country -> district pages, look for invite link.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/world`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  await s.page.getByRole('button', { name: /Bellean/ }).first().click();
  await s.page.waitForTimeout(2500);
  console.log('URL after Bellean:', s.page.url());
  await s.shot('13-bellean');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Opened Bellean (my country) from the World screen.');
} catch (e) {
  await s.shot('13-bellean-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
