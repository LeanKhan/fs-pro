// P01 resumed session step 03 — dismiss "While you were away", follow Vintra's tip chain.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);

  // Forced modal on return (P01 frustration #5). Dismiss it the obvious way.
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) {
    await letsGo.first().click();
    await s.page.waitForTimeout(1200);
    await s.shot('s02-02-after-away-modal');
    await s.decide('Dismissed the forced "While you were away" modal with "Let\'s go!" — had to be cleared before anything else was tappable.');
  }

  // Follow the advisor "Next" chain; capture each tip.
  for (let i = 1; i <= 6; i++) {
    const next = s.page.getByRole('button', { name: 'Next' });
    if (!(await next.count())) { console.log(`-- advisor Next not present at i=${i}`); break; }
    await next.first().click();
    await s.page.waitForTimeout(900);
    const a = await s.ariaSnapshot();
    const m = a.match(/status: (.*)/);
    console.log(`TIP ${i}:`, m ? m[1] : '(no status)');
    await s.shot(`s02-03-advisor-${i}`);
  }
  await s.decide('Tapped through Vintra\'s tip chain with Next; recorded each tip.');
} catch (e) {
  await s.shot('s02-error2');
  await s.decide(`Blocked in advisor chain: ${e.message}`);
} finally {
  await s.close();
}
