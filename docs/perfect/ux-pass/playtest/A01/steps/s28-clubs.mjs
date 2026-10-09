// A01 Session 2, step 28: admin Clubs list columns + admin club detail + player detail.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
const trim = (t, n = 80) => t.split('\n').slice(0, n).join('\n');
const mainOf = (aria) => { const i = aria.indexOf('- main:'); return i >= 0 ? aria.slice(i) : aria; };
try {
  // Clubs list -> column headers.
  await s.page.goto(s.url + '/a/clubs', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(5000);
  await s.shot('56-s2-clubs');
  const clubsAria = await s.ariaSnapshot();
  const hdr = clubsAria.split('\n').filter((l) => /columnheader/.test(l)).slice(0, 20).join('\n');
  console.log('-----CLUBS headers-----');
  console.log(hdr);
  console.log('-----END-----');

  // Search the admin's own club and open it.
  const search = s.page.getByRole('textbox', { name: /search/i }).first();
  await search.fill('Playtest Admin');
  await s.page.waitForTimeout(3500);
  await s.shot('57-s2-clubs-search-admin');
  const viewBtn = s.page.getByRole('button').filter({ has: s.page.locator('i') }).first();
  // fall back to the first eye-like button in the table
  const firstAction = s.page.locator('table tbody tr').first().getByRole('button').first();
  if (await firstAction.count()) {
    await firstAction.click({ timeout: 6000 }).catch(() => {});
    await s.page.waitForTimeout(4000);
  }
  console.log('[url after club open]', s.page.url());
  await s.shot('58-s2-admin-club-detail', { fullPage: true });
  console.log('-----CLUB DETAIL main-----');
  console.log(trim(mainOf(await s.ariaSnapshot()), 55));
  console.log('-----END-----');
  await s.decide('Session 2: inspected admin Clubs list columns and a club detail, looking for owner/moderation controls.');
} finally {
  await s.close();
}
