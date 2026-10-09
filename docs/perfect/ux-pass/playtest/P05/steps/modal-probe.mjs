// P05: probe the "While you were away" overlay semantics keyboard-only.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import { activeInfo, tabTo } from 'file:///C:/done/fs-pro/.playtest-runtime/p05/p05lib.mjs';

const s = await personaContext('P05');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);

  const dialogCount = await s.page.locator('[role="dialog"],[role="alertdialog"]').count();
  const ariaModal = await s.page.locator('[aria-modal="true"]').count();
  console.log(`role=dialog/alertdialog on page: ${dialogCount}`);
  console.log(`[aria-modal=true] on page: ${ariaModal}`);
  console.log(`activeElement: ${JSON.stringify(await activeInfo(s.page))}`);

  // Tab from the top and find where "Close" / "Let's go!" are.
  await s.page.evaluate(() => document.body.focus());
  const closeHit = await tabTo(s.page, /^Close$/, 60);
  console.log(`"Close" reached at tab #${closeHit ? closeHit.i : 'not-found'}`);
  const goHit = await tabTo(s.page, /let'?s go/i, 60);
  console.log(`"Let's go!" reached at tab #${goHit ? goHit.i : 'not-found'}`);

  // Escape test.
  await s.page.keyboard.press('Escape');
  await s.page.waitForTimeout(700);
  const stillThere = await s.page.getByRole('button', { name: "Let's go!" }).count();
  console.log(`after Escape, "Let's go!" still present: ${stillThere}`);

  console.log(`shot=${await s.shot('26-away-modal-probe')}`);
  await s.decide('Probed the "While you were away" overlay: role=dialog count and Escape behaviour.');
} finally {
  await s.close();
}
