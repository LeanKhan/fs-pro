import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateProgramStep,
  getProgramSteps,
  nextProgramStep,
  programTip,
} from '../src/services/world/world-service.client';

/**
 * The owner-program Go-boundary client (services/world/world-service.client.ts
 * + PROGRAM-SERVICE-CONTRACT.md). `fetch` is mocked, so these cover URL/method/
 * body shape, response parsing and the non-2xx throw - no Go service needed.
 * A drifted Go response must fail at the boundary (the zod parse).
 */

const BASE = 'http://world.test:9999';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let previousUrl: string | undefined;

beforeEach(() => {
  previousUrl = process.env.WORLD_SERVICE_URL;
  process.env.WORLD_SERVICE_URL = BASE;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousUrl === undefined) delete process.env.WORLD_SERVICE_URL;
  else process.env.WORLD_SERVICE_URL = previousUrl;
});

function lastCall(): [string, RequestInit | undefined] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
}

const facts = {
  step: 'manager' as const,
  startingBalance: 1_000_000,
  budget: 900_000,
  manager: null,
  squad: { total: 0, gk: 0, def: 0, mid: 0, att: 0, medianRating: 0 },
  assets: [],
  programXp: 0,
  clubXp: 0,
  friendlies: { wins: 0, draws: 0, losses: 0 },
  scout: { managersBrowsed: 0, interviewedManagerIds: [], scoutedPlayerIds: [] },
  events: { playBlocked: false, sessionMinutes: 0, programCompletedOnce: false },
};

const advisorLine = {
  id: 'step.manager.arrive',
  speaker: 'vintra',
  text: 'Right then. Every club needs one voice on the training pitch.',
  expr: 'neutral',
  pose: 'idle',
  target: null,
  priority: 80,
  dismissible: true,
  maxShows: 1,
  cooldownSeconds: 0,
  once: false,
};

describe('GET /program/steps', () => {
  it('parses the step table and fees', async () => {
    const config = {
      steps: [
        {
          id: 'manager',
          order: 1,
          rewards: { '1': 3, '2': 9, '3': 18 },
          starLabels: { '1': 'Any hire with a live contract.' },
          advisorRules: ['step.manager.arrive'],
        },
      ],
      programXpCap: 54,
      level1Xp: 100,
      matchXp: { win: 30, draw: 10, loss: 5 },
      fees: { interview: 25_000, scout: 15_000 },
    };
    fetchMock.mockResolvedValue(jsonResponse(config));

    await expect(getProgramSteps()).resolves.toEqual(config);
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/program/steps`);
    expect(init).toBeUndefined();
  });
});

describe('POST /program/evaluate', () => {
  it('POSTs { step, facts } and parses the evaluation', async () => {
    const evaluation = {
      step: 'manager',
      completed: false,
      stars: 0,
      xp: 0,
      programXp: 0,
      reasons: ['manager not signed'],
      advisor: [advisorLine],
    };
    fetchMock.mockResolvedValue(jsonResponse(evaluation));

    await expect(evaluateProgramStep({ step: 'manager', facts })).resolves.toEqual(evaluation);
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/program/evaluate`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ step: 'manager', facts });
  });

  it('throws when the response drifts from the contract schema', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ step: 'manager', completed: true }));
    await expect(evaluateProgramStep({ step: 'manager', facts })).rejects.toThrow();
  });

  it('throws on a non-2xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad step' }, { ok: false, status: 400 }));
    await expect(evaluateProgramStep({ step: 'manager', facts })).rejects.toThrow(
      'world-service POST /program/evaluate failed (400)'
    );
  });
});

describe('POST /program/next', () => {
  it('parses the next step', async () => {
    const next = { step: 'manager', completed: true, nextStep: 'players' };
    fetchMock.mockResolvedValue(jsonResponse(next));
    await expect(nextProgramStep({ step: 'manager', facts })).resolves.toEqual(next);
    expect(lastCall()[0]).toBe(`${BASE}/program/next`);
  });
});

describe('POST /program/tip', () => {
  it('POSTs the advisor state + now and parses the tip', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tip: advisorLine }));
    const request = {
      facts,
      advisor: { shows: {}, lastShownAt: {}, dismissed: [], quiet: false },
      now: 1_759_800_060_000,
    };
    await expect(programTip(request)).resolves.toEqual({ tip: advisorLine });
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/program/tip`);
    expect(JSON.parse(init?.body as string)).toEqual(request);
  });

  it('parses a null tip', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tip: null }));
    await expect(
      programTip({ facts, advisor: { shows: {}, lastShownAt: {}, dismissed: [], quiet: false }, now: 1 })
    ).resolves.toEqual({ tip: null });
  });
});
