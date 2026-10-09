// P02 resume step: confirm the preserved login lands me in the game.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  console.log('URL:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('40-resume-landing');
  await s.decide('Resumed after the outage: opened the client; checking whether the preserved login lands me at my club.');
} catch (e) {
  await s.shot('40-resume-error');
  await s.decide(`Resume blocked: ${e.message}`);
} finally {
  await s.close();
}
