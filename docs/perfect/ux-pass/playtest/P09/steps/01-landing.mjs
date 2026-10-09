// P09 step 01 — open the client fresh, capture landing + a11y tree.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P09');
try {
  console.log(`[P09] viewport ${s.spec.viewport.width}x${s.spec.viewport.height} touch=${s.spec.touch}`);
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  const aria = await s.ariaSnapshot();
  console.log('--- ARIA ---');
  console.log(aria);
  console.log('--- /ARIA ---');
  await s.shot('01-landing');
  await s.decide(`Session 1 start: opened ${s.url} at 768x1024 portrait (touch). Captured landing + a11y.`);
} finally {
  await s.close();
}
console.log('DONE');
