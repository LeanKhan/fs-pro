import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P07');
try {
  await s.page.goto(s.url + '/game/91cc9be0-f0a5-4b86-998c-accaae73f457/program', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  await s.shot('15a-facilities');
  // Scroll to the very bottom to see whether the green hill hides the last row.
  await s.page.mouse.wheel(0, 4000);
  await s.page.waitForTimeout(1200);
  await s.shot('15b-facilities-scrolled-bottom');
  // Scroll back up and build the recommended cheapest (Training Ground).
  await s.page.mouse.wheel(0, -4000);
  await s.page.waitForTimeout(1000);
  await s.page.getByRole('button', { name: 'Build Tier 1' }).first().click();
  await s.page.waitForTimeout(2500);
  await s.shot('15c-build-confirm');
  console.log('--- after Build click ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Opened Facilities, scrolled to check the bottom row, and pressed "Build Tier 1" on the Training Ground.');
} catch (e) {
  await s.shot('15-error');
  await s.decide('Blocked building a facility: ' + e.message);
} finally {
  await s.close();
}
