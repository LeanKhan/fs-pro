import { personaContext } from '../../../../../../tests/e2e/playtest/harness.mjs';

const s = await personaContext('A01');
try {
  // Reach the console through the UI path so the header state loads (see A01-06).
  await s.page.goto(s.url + '/u/settings', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await s.page.waitForTimeout(4000);
  await s.page.getByRole('link', { name: /Admin console/i }).click();
  await s.page.waitForTimeout(3000);
  await s.page.getByText('World & Calendar', { exact: true }).click();
  await s.page.waitForTimeout(4000);
  console.log('[A01] url=', s.page.url());

  const daylen = s.page.getByRole('spinbutton', { name: /Game day length/i });
  console.log('[A01] day length value=', await daylen.inputValue());

  // Scroll the live-clock card into view for a clear screenshot.
  await s.page.getByText(/Live Game Clock/i).scrollIntoViewIfNeeded();
  await s.page.waitForTimeout(800);
  await s.shot('22-live-clock');

  // Exercise "Save pacing" (no value change) to confirm the admin flow + feedback.
  await s.page.getByRole('button', { name: /^Save pacing$/i }).click();
  await s.page.waitForTimeout(2500);
  await s.shot('23-save-pacing');
  console.log('[A01] url after save=', s.page.url());
  console.log('-----DIALOG ARIA-----');
  console.log(await s.ariaSnapshot());
  console.log('-----END-----');
  await s.decide('Confirmed day length reads 48 and exercised "Save pacing" to see feedback.');
} finally {
  await s.close();
}
