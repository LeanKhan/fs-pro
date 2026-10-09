import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(9000);
  await s.shot('17a-campus-state');
  console.log('--- campus aria ---');
  console.log(await s.ariaSnapshot());
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457/program', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  await s.shot('17b-program-state');
  console.log('--- program aria (head) ---');
  const snap = await s.ariaSnapshot();
  console.log(snap.split('\n').slice(0, 40).join('\n'));
  await s.decide('Returned after the restart to check state: campus + Owner program.');
} catch (e) {
  await s.shot('17-error');
  await s.decide('Blocked checking state: ' + e.message);
} finally {
  await s.close();
}
