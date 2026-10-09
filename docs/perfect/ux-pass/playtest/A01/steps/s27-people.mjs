// A01 Session 2, step 27: re-check Managers, Players, Clubs and open a player.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 60) => t.split('\n').slice(0, n).join('\n');
const mainOf = (aria) => {
  const i = aria.indexOf('- main:');
  return i >= 0 ? aria.slice(i) : aria;
};
try {
  // Managers (A01-10 was an Error! fallback).
  await s.page.goto(s.url + '/a/managers', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(5000);
  await s.shot('53-s2-managers');
  console.log('-----MANAGERS main-----');
  console.log(trim(mainOf(await s.ariaSnapshot()), 25));
  console.log('-----END-----');

  // Players.
  await s.page.goto(s.url + '/a/players', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(5000);
  await s.shot('54-s2-players');
  console.log('-----PLAYERS main-----');
  console.log(trim(mainOf(await s.ariaSnapshot()), 30));
  console.log('-----END-----');

  // Open the first player row (a detail view).
  const viewBtns = s.page.getByRole('button', { name: /view|eye|open/i });
  if (await viewBtns.count()) {
    await viewBtns.first().click({ timeout: 6000 }).catch(() => {});
    await s.page.waitForTimeout(4000);
  }
  console.log('[url after player open]', s.page.url());
  await s.shot('55-s2-player-detail', { fullPage: true });
  await s.decide('Session 2: re-checked Managers/Players, opened a player detail; noted moderation affordances.');
} finally {
  await s.close();
}
