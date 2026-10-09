// P06 step 22 — follow Vintra advisor + Owner's program + Challenges.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  for (let i = 0; i < 5; i++) {
    const b = s.page.getByRole('button', { name: /Let's go!|Got it|Continue/ }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await s.page.waitForTimeout(1000); } else break;
  }

  // Click Vintra advisor "Next" twice.
  for (let i = 0; i < 2; i++) {
    const next = s.page.getByRole('button', { name: 'Next', exact: true });
    if (await next.count() && await next.isVisible().catch(() => false)) { await next.click().catch(() => {}); await s.page.waitForTimeout(2500); }
  }
  const advisor = await s.ariaSnapshot();
  console.log('[advisor]', advisor.split('\n').filter((l) => /Vintra|status|Still no|manager|advisor|Next|tips/i.test(l)).join('\n'));
  await s.shot('35-advisor');

  // Owner's program
  const op = s.page.getByRole('button', { name: /Owner's program/ }).first();
  if (await op.count()) { await op.click().catch(() => {}); await s.page.waitForTimeout(3500); }
  await s.shot('36-owners-program');
  const ariaOp = await s.ariaSnapshot();
  console.log('[owners-program]', ariaOp.split('\n').slice(-45).join('\n'));
  await s.decide('Followed Vintra advisor and opened Owner\'s program looking for manager hiring.');
} finally {
  await s.close();
}
