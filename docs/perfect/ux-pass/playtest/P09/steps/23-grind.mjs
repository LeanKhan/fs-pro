// P09 step 23 — grind qualifying friendlies toward Level 2 (400 XP).
// Retains persona: pads touch, 768x1024; one match played in landscape.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const BUDGET_MS = 9 * 60 * 1000;
const t0 = Date.now();
const watchdog = setTimeout(() => { console.error('[watchdog] exit'); process.exit(0); }, BUDGET_MS + 40000);

const s = await personaContext('P09');
const log = [];
const levelLine = async () => (await s.page.getByText(/\d+\/\d{3}/).first().textContent().catch(() => '?'))?.trim().replace(/\s+/g, ' ');
const shotAndLog = async (m) => { const l = await levelLine(); log.push(`m${m}: ${l}`); console.log(`[m${m}] ${l}`); return l; };

try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }

  for (let m = 0; m < 12 && Date.now() - t0 < BUDGET_MS; m++) {
    // Dismiss any open result/victory overlay.
    const back = s.page.getByRole('button', { name: /Back to the grounds/ });
    if (await back.count()) { await back.last().click(); await s.page.waitForTimeout(1500); }

    // Open PLAY.
    const play = s.page.getByRole('button', { name: /^PLAY/ });
    if (!(await play.count())) { console.log('no PLAY button; stopping'); break; }
    await play.first().click();
    await s.page.waitForTimeout(2500);

    const pn = s.page.getByRole('button', { name: 'Play now' });
    if (!(await pn.count())) {
      const rest = await s.page.getByText(/Resting \d+:\d+/).first().textContent().catch(() => '(no resting text)');
      console.log(`[m${m}] no Play now; ${rest}; waiting`);
      await s.page.waitForTimeout(20000);
      continue;
    }
    await pn.click();
    // Wait for the Matchzone.
    let opened = false;
    for (let i = 0; i < 30; i++) {
      await s.page.waitForTimeout(1000);
      if (await s.page.getByRole('button', { name: /Leave the Matchzone/ }).count()) { opened = true; break; }
    }
    if (!opened) { console.log(`[m${m}] matchzone did not open`); await s.shot(`23-m${m}-nomatch`); continue; }

    // Persona probe: play match #2 in landscape to test rotation mid-match.
    if (m === 1) {
      await s.page.setViewportSize({ width: 1024, height: 768 });
      await s.page.waitForTimeout(1500);
      await s.shot('23-landscape-matchzone');
      const la = await s.ariaSnapshot();
      fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step23-landscape-matchzone-aria.txt', la);
    }

    const res = s.page.getByRole('button', { name: /^Result/ });
    if (await res.count()) { await res.click(); await s.page.waitForTimeout(2000); }
    const col = s.page.getByRole('button', { name: /Collect rewards/ });
    if (await col.count()) { await col.click(); await s.page.waitForTimeout(2500); }
    await s.shot(`23-m${m}-result`);
    await shotAndLog(m);

    if (m === 1) { await s.page.setViewportSize({ width: 768, height: 1024 }); await s.page.waitForTimeout(1200); }

    // Stop when Level 2 HUD appears.
    const lvlLine = (await levelLine()) || '';
    if (/^2\b/.test(lvlLine)) { console.log('reached Level 2 HUD'); break; }
  }
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step23-log.txt', log.join('\n'));
  await s.shot('23-final');
  await s.decide(`Grind loop: played friendlies toward Level 2. Levels seen: ${log.join(' | ')}`);
} finally {
  clearTimeout(watchdog);
  await s.close({ keepTracing: true }).catch(() => {});
}
console.log('DONE');
process.exit(0);
