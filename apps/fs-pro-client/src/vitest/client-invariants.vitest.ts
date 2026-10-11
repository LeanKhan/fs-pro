import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Cross-cutting client invariants, run by Vitest (OW-N03). These guard the
 * platform-track work that has no unit-testable runtime logic of its own:
 *
 *  - OW-D08: the legacy 2D visualizer + `socket.io-client` are gone, and
 *    nothing re-introduces them.
 *  - OW-D12: the shared design tokens have exactly one source
 *    (`src/styles/tokens.css`) and the scopes consume it.
 *  - OW-P17: duration formatting has exactly one implementation (the countdown
 *    primitive) — no stray `formatClock` / `shortClock` copies.
 */

const url = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string) => readFileSync(url(rel), 'utf8');

/** Every `src` file that is *not* this Vitest suite (which names what it bans). */
function srcFiles(dir = url('..')): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...srcFiles(full));
    else if (
      /\.(ts|vue|scss|css)$/.test(entry.name) &&
      !entry.name.endsWith('.vitest.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('OW-D08 — the legacy 2D visualizer is retired', () => {
  const deleted = [
    '../components/matchzone/live-pitch.vue',
    '../utils/matchReplaySocket.ts',
    '../store/socket.ts',
    '../services/socket.ts',
    '../views/game/PitchPreview.html',
  ];

  it('no longer exists on disk', () => {
    for (const rel of deleted) expect(existsSync(url(rel)), rel).toBe(false);
  });

  it('is gone from package.json and every source file', () => {
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['socket.io-client']).toBeUndefined();
    expect(pkg.devDependencies?.['socket.io-client']).toBeUndefined();

    for (const file of srcFiles()) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} still imports socket.io-client`).not.toMatch(
        /['"]socket\.io-client['"]/
      );
      expect(source, `${file} still references the legacy visualizer`).not.toMatch(
        /matchReplaySocket|live-pitch|useSocketStore|appSocket/
      );
    }
  });

  it('main.ts no longer sets a global socket', () => {
    expect(read('../main.ts')).not.toMatch(/\$socket/);
  });
});

describe('OW-D12 — one design-token source', () => {
  const canonical = read('../styles/tokens.css');

  it('declares the shared tokens on :root', () => {
    for (const token of [
      '--ink',
      '--cream',
      '--cream-2',
      '--wood',
      '--wood-d',
      '--muted',
      '--edge',
      '--green',
      '--green-d',
      '--red',
      '--gold',
      '--blue',
      '--shadow',
      '--panel',
      '--pitch-a',
      '--pitch-b',
      '--chalk',
      '--home',
      '--away',
      '--amber',
    ]) {
      expect(canonical, `tokens.css is missing ${token}`).toContain(`${token}:`);
    }
  });

  it('is consumed by cozy, matchzone and the grid, which no longer re-declare it', () => {
    const cozy = read('../components/cozy/cozy.scss');
    const matchzone = read('../components/matchzone/matchzone.scss');
    const board = read('../components/cozy/grid/pitch-grid-board.vue');

    expect(cozy).toContain('@use');
    expect(matchzone).toContain('@use');
    expect(cozy).toMatch(/tokens\.css/);
    expect(matchzone).toMatch(/tokens\.css/);
    // The grid consumes the canonical names rather than literals.
    expect(board).toMatch(/var\(--edge\)/);
    expect(board).toMatch(/var\(--green-d\)/);
    // No scope re-declares the palette locally any more.
    expect(cozy).not.toMatch(/--ink:/);
    expect(matchzone).not.toMatch(/--ink:/);
  });
});

describe('OW-P17 — one duration formatter', () => {
  it('has no stray formatClock / shortClock / formatDuration copies', () => {
    for (const file of srcFiles()) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} re-declares a duration formatter`).not.toMatch(
        /function (formatClock|shortClock|formatDuration)\b/
      );
    }
  });
});
