// P10 step 01: open the client landing page, capture what a person sees.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P10');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('01-landing');
  await s.shot('01-landing-full', { fullPage: true });
  const aria = await s.ariaSnapshot();
  fs.writeFileSync(`${s.dir}\\ua-01-landing.txt`, aria, 'utf8');
  console.log('=== TITLE ===', await s.page.title());
  console.log('=== URL ===', s.page.url());
  console.log(aria);
  await s.decide('Opened the landing page at 1920x1080; captured full a11y tree.');
} finally {
  await s.close();
}
