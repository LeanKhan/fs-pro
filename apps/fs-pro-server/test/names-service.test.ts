import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generatePersonNames,
  generatePersonNamesForCulture,
  generatePlaceName,
  resetFallbackLog,
  splitFullName,
} from '../src/services/worldgen/names.service';

/**
 * names.service is the one Node window onto worldgen (L12). These tests pin the
 * happy path, the parsed split, the logged fallback when worldgen is down, and
 * the down-cooldown that stops a reverse-proxy outage costing a failed
 * connection per call.
 */

const realFetch = global.fetch;

function mockOk(names: string[], cultures?: Record<string, number>) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ names, cultures }),
  })) as unknown as typeof fetch;
}

function mockDown() {
  global.fetch = vi.fn(async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:3004');
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  resetFallbackLog();
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = realFetch;
  resetFallbackLog();
});

describe('splitFullName', () => {
  it('splits worldgen first__last', () => {
    expect(splitFullName('Ruva__Ligi')).toEqual({ firstName: 'Ruva', lastName: 'Ligi' });
  });
  it('falls back to a spaced name', () => {
    expect(splitFullName('Ruva Ligi')).toEqual({ firstName: 'Ruva', lastName: 'Ligi' });
  });
});

describe('generatePersonNames', () => {
  it('parses a mixed-name response', async () => {
    mockOk(['A__One', 'B__Two'], { karsh: 1, kev: 1 });
    const names = await generatePersonNames('bellean', 2);
    expect(names).toEqual([
      { firstName: 'A', lastName: 'One' },
      { firstName: 'B', lastName: 'Two' },
    ]);
  });

  it('logs and falls back when worldgen is down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockDown();
    const names = await generatePersonNames('bellean', 3);
    expect(names).toHaveLength(3);
    expect(names.every((n) => n.firstName && n.lastName)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('down');
  });

  it('does not call fetch again during the down cooldown', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockDown();
    await generatePersonNames('bellean', 1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await generatePersonNames('bellean', 1);
    expect(global.fetch).toHaveBeenCalledTimes(1); // short-circuited
  });
});

describe('generatePersonNamesForCulture', () => {
  it('parses a per-culture response', async () => {
    mockOk(['Kev__One']);
    const names = await generatePersonNamesForCulture('kev', 1);
    expect(names).toEqual([{ firstName: 'Kev', lastName: 'One' }]);
  });
});

describe('generatePlaceName', () => {
  it('uses the generated name when worldgen answers', async () => {
    mockOk(['Gate Nejedre']);
    expect(await generatePlaceName('bellean', 'district', () => 'Fallback')).toBe('Gate Nejedre');
  });

  it('uses the local fallback when worldgen is down', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockDown();
    expect(await generatePlaceName('bellean', 'district', () => 'Fallback')).toBe('Fallback');
  });
});
