import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  console.log(`[A01] url=${s.url} viewport=${s.spec.viewport.width}x${s.spec.viewport.height}`);
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(2500);
  console.log('[A01] title=', await s.page.title());
  console.log('[A01] finalUrl=', s.page.url());
  await s.shot('01-landing');
  const aria = await s.ariaSnapshot();
  console.log('-----ARIA-----');
  console.log(aria);
  console.log('-----END ARIA-----');
  await s.decide('A01 recon: opened client, captured landing screenshot + a11y tree.');
} finally {
  await s.close();
}
