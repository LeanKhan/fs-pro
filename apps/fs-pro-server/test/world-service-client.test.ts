import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  drawPyramid,
  getPlaceChildren,
  getPlacementSpot,
  getProminence,
  joinPyramid,
  recomputeProminence,
  worldServiceHealth,
  worldServiceHealthy,
} from '../src/services/world/world-service.client';

/**
 * Unit tests for the world-service HTTP client
 * (src/services/world/world-service.client.ts). `fetch` is mocked, so these
 * cover URL building, method/body/header shape, response parsing and the
 * non-2xx throw - no Go service needed.
 */

const BASE = 'http://world.test:9999';

const health = {
  status: 'ok',
  service: 'fs-pro-world-service',
  version: 'dev',
  database: 'up',
  uptimeSeconds: 1,
  time: '2026-10-07T12:00:00Z',
};

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

describe('getPlacementSpot', () => {
  it('POSTs the request body to /placement/spot and parses the spot', async () => {
    const spot = {
      kind: 'district',
      districtId: 'd1',
      cityId: 'c1',
      regionId: 'r1',
      countryId: 'co1',
      needsNames: [],
      x: 1,
      y: 2,
      invite: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(spot));

    await expect(getPlacementSpot({ clubId: 'cl1', inviteToken: null })).resolves.toEqual(spot);

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/placement/spot`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ clubId: 'cl1', inviteToken: null });
  });
});

describe('getPlaceChildren', () => {
  it('builds the path, encodes the id and appends the optional type query', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ children: [] }));

    await getPlaceChildren('place 1', 'city');
    expect(lastCall()[0]).toBe(`${BASE}/places/place%201/children?type=city`);

    await getPlaceChildren('place-2');
    expect(lastCall()[0]).toBe(`${BASE}/places/place-2/children`);
    expect(lastCall()[1]).toBeUndefined();
  });
});

describe('getProminence / recomputeProminence', () => {
  it('GETs one club and parses the score', async () => {
    const prominence = { clubId: 'cl1', prominence: 42.5, updatedAt: null };
    fetchMock.mockResolvedValue(jsonResponse(prominence));

    await expect(getProminence('cl1')).resolves.toEqual(prominence);
    expect(lastCall()[0]).toBe(`${BASE}/prominence/cl1`);
  });

  it('POSTs the club id batch and parses { updated }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ updated: 2 }));

    await expect(recomputeProminence({ clubIds: ['a', 'b'] })).resolves.toEqual({ updated: 2 });

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/prominence/recompute`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ clubIds: ['a', 'b'] });
  });
});

describe('pyramid', () => {
  it('POSTs the draw with no body and parses the pools', async () => {
    const draw = {
      pools: [
        { division: 1, regionKey: 'r', cityKey: 'c', districtKey: 'd', clubIds: ['a'] },
      ],
    };
    fetchMock.mockResolvedValue(jsonResponse(draw));

    await expect(drawPyramid('comp 1')).resolves.toEqual(draw);

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/pyramid/draw/comp%201`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
  });

  it('POSTs the join body and parses the slot', async () => {
    const join = { division: 4, poolId: null, slot: 0, newPool: true };
    fetchMock.mockResolvedValue(jsonResponse(join));

    await expect(joinPyramid({ competitionId: 'comp1', clubId: 'cl1' })).resolves.toEqual(join);

    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/pyramid/join`);
    expect(JSON.parse(init?.body as string)).toEqual({ competitionId: 'comp1', clubId: 'cl1' });
  });
});

describe('health', () => {
  it('GETs /health and parses the payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse(health));

    await expect(worldServiceHealth()).resolves.toEqual(health);
    expect(lastCall()[0]).toBe(`${BASE}/health`);
  });

  it('worldServiceHealthy is true on ok and false on a non-2xx or a bad payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(health));
    await expect(worldServiceHealthy()).resolves.toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'down' }, { ok: false, status: 503 }));
    await expect(worldServiceHealthy()).resolves.toBe(false);
  });

  it('falls back to http://localhost:3006 when WORLD_SERVICE_URL is unset', async () => {
    delete process.env.WORLD_SERVICE_URL;
    fetchMock.mockResolvedValue(jsonResponse(health));

    await worldServiceHealth();
    expect(lastCall()[0]).toBe('http://localhost:3006/health');
  });
});

describe('errors', () => {
  it('throws on a non-2xx with the status and endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, { ok: false, status: 500 }));

    await expect(getProminence('cl1')).rejects.toThrow(
      'world-service GET /prominence/:clubId failed (500)'
    );
  });

  it('throws when the body does not match the contract schema', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ clubId: 'cl1' }));

    await expect(getProminence('cl1')).rejects.toThrow();
  });
});
