// P02 step 41: dismiss the comeback modal, open the Manager flow.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  // Dismiss the "While you were away" dialog if present.
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count()) {
    await letsGo.first().click().catch(() => {});
    await s.page.waitForTimeout(800);
  }
  await s.shot('41-campus-ready');
  // Open the Manager flow via the dock button.
  const manager = s.page.getByRole('button', { name: /^Manager$/ }).first();
  await manager.click().catch(async () => {
    await s.page.getByRole('button', { name: /Manager/i }).first().click();
  });
  await s.page.waitForTimeout(2500);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('41-manager-open');
  await s.decide('Dismissed the comeback modal (Escape still does nothing, P02-09). Opened Manager to hire my first manager.');
} catch (e) {
  await s.shot('41-error');
  await s.decide(`Step 41 blocked: ${e.message}`);
} finally {
  await s.close();
}
