// P06 step 23 — start the Owner's program -> hire a manager.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  for (let i = 0; i < 6; i++) {
    const b = s.page.getByRole('button', { name: /Let's go!|Got it|Continue/ }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await s.page.waitForTimeout(900); } else break;
  }

  // Open Owner's program
  const op = s.page.getByRole('button', { name: /Owner's program/ }).first();
  if (await op.count()) { await op.click().catch(() => {}); await s.page.waitForTimeout(3000); }

  const start = s.page.getByRole('button', { name: /start the program/i }).first();
  if (await start.count() && await start.isVisible().catch(() => false)) {
    await start.click().catch(() => {});
    await s.page.waitForTimeout(4000);
  }
  await s.shot('37-program-start');
  let aria = await s.ariaSnapshot();
  console.log('[after-start]', aria.split('\n').slice(-60).join('\n'));
  console.log('=====');

  // Maybe a manager list appeared; look for "manager" list items or a "Hire" button.
  const hire = s.page.getByRole('button', { name: /Hire|Sign|Offer/i }).first();
  if (await hire.count() && await hire.isVisible().catch(() => false)) {
    await s.shot('38-before-hire');
    console.log('[hire-button]', await hire.textContent().catch(() => '?'));
  }
  await s.decide('Started the Owner\'s program and looked for the manager-hiring list.');
} finally {
  await s.close();
}
