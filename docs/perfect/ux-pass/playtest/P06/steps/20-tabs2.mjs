// P06 step 20 — read The brief and Squad tabs in Owner's office.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  for (let i = 0; i < 5; i++) {
    const b = s.page.getByRole('button', { name: /Let's go!|Got it|Continue/ }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await s.page.waitForTimeout(1000); } else break;
  }
  await s.page.getByRole('button', { name: 'Manager', exact: true }).last().click();
  await s.page.waitForTimeout(3000);

  async function openTab(name) {
    await s.page.evaluate((n) => {
      const b = [...document.querySelectorAll('button')].find((x) => new RegExp(`^${n}$`).test((x.textContent || '').trim()));
      const nav = b?.closest('nav') || b?.parentElement;
      if (nav) nav.scrollLeft = 0;
      if (b) b.click();
    }, name);
    await s.page.waitForTimeout(3500);
    await s.shot(`32-tab-${name.replace(/\s+/g, '-').toLowerCase()}`);
    const aria = await s.ariaSnapshot();
    console.log(`[tab ${name}] ${aria.split('\n').slice(-40).join('\n')}`);
    console.log('-----');
  }
  await openTab('The brief');
  await openTab('Squad');
  await s.decide('Read Owner\'s office "The brief" and "Squad" tabs to find where to hire a manager.');
} finally {
  await s.close();
}
