import { describe, expect, it } from 'vitest';
import {
  PlaceChildrenSchema,
  PlacementSpotSchema,
  ProminenceRecomputeResultSchema,
  ProminenceRecomputeSchema,
  ProminenceSchema,
  PyramidDrawSchema,
  PyramidJoinRequestSchema,
  PyramidJoinSchema,
  WorldServiceHealthSchema,
} from '@repo/api-contract';

/**
 * Unit tests for the world-service contract schemas
 * (packages/api-contract/src/schemas/world-service.ts, frozen in
 * docs/perfect/WORLD-SERVICE-CONTRACT.md). One valid + one invalid case per
 * shape so a schema drift is caught without a running Go service.
 */

const validSpot = {
  kind: 'district',
  districtId: 'd1',
  cityId: 'c1',
  regionId: 'r1',
  countryId: 'co1',
  needsNames: ['city', 'region', 'country'],
  x: 1.5,
  y: 2.5,
  invite: { placeId: 'p1', level: 'district' },
};

describe('PlacementSpotSchema', () => {
  it('parses an invited spot and an uninvited hole', () => {
    expect(PlacementSpotSchema.parse(validSpot)).toEqual(validSpot);

    const hole = {
      ...validSpot,
      kind: 'hole',
      needsNames: [],
      invite: null,
    };
    expect(PlacementSpotSchema.parse(hole)).toEqual(hole);
  });

  it('rejects an unknown kind, a missing field and an unknown needsName', () => {
    expect(PlacementSpotSchema.safeParse({ ...validSpot, kind: 'town' }).success).toBe(false);

    const { districtId: _drop, ...missing } = validSpot;
    expect(PlacementSpotSchema.safeParse(missing).success).toBe(false);

    expect(
      PlacementSpotSchema.safeParse({ ...validSpot, needsNames: ['district'] }).success
    ).toBe(false);
  });

  it('rejects an invite with an unknown level', () => {
    expect(
      PlacementSpotSchema.safeParse({
        ...validSpot,
        invite: { placeId: 'p1', level: 'region' },
      }).success
    ).toBe(false);
  });
});

describe('PlaceChildrenSchema', () => {
  const valid = {
    children: [
      {
        id: 'd1',
        type: 'district',
        name: 'London Central',
        code: 'D-1',
        parentId: 'c1',
        regionId: null,
        mapX: 10,
        mapY: 20,
        clubs: 3,
      },
    ],
  };

  it('parses a child list', () => {
    expect(PlaceChildrenSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an old town type and a child missing clubs', () => {
    expect(
      PlaceChildrenSchema.safeParse({ children: [{ ...valid.children[0], type: 'town' }] }).success
    ).toBe(false);

    const { clubs: _drop, ...child } = valid.children[0]!;
    expect(PlaceChildrenSchema.safeParse({ children: [child] }).success).toBe(false);
  });
});

describe('ProminenceSchema', () => {
  it('parses a scored club and a never-recomputed one', () => {
    expect(
      ProminenceSchema.parse({ clubId: 'cl1', prominence: 42.5, updatedAt: '2026-10-07T12:00:00Z' })
    ).toEqual({ clubId: 'cl1', prominence: 42.5, updatedAt: '2026-10-07T12:00:00Z' });
    expect(ProminenceSchema.parse({ clubId: 'cl1', prominence: 0, updatedAt: null })).toEqual({
      clubId: 'cl1',
      prominence: 0,
      updatedAt: null,
    });
  });

  it('rejects a non-numeric prominence and a numeric updatedAt', () => {
    expect(
      ProminenceSchema.safeParse({ clubId: 'cl1', prominence: 'high', updatedAt: null }).success
    ).toBe(false);
    expect(
      ProminenceSchema.safeParse({ clubId: 'cl1', prominence: 1, updatedAt: 123 }).success
    ).toBe(false);
  });
});

describe('ProminenceRecomputeSchema', () => {
  it('parses a club id list', () => {
    expect(ProminenceRecomputeSchema.parse({ clubIds: ['a', 'b'] })).toEqual({ clubIds: ['a', 'b'] });
  });

  it('rejects a non-array and a non-string entry', () => {
    expect(ProminenceRecomputeSchema.safeParse({ clubIds: 'a' }).success).toBe(false);
    expect(ProminenceRecomputeSchema.safeParse({ clubIds: [1] }).success).toBe(false);
  });

  it('parses the literal recompute result', () => {
    expect(ProminenceRecomputeResultSchema.parse({ updated: 0 })).toEqual({ updated: 0 });
    expect(ProminenceRecomputeResultSchema.safeParse({ updated: '0' }).success).toBe(false);
  });
});

describe('PyramidDrawSchema', () => {
  const valid = {
    pools: [
      {
        division: 4,
        regionKey: 'r1',
        cityKey: 'c1',
        districtKey: 'd1',
        clubIds: ['a', 'b'],
      },
    ],
  };

  it('parses a pool assignment', () => {
    expect(PyramidDrawSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a pool missing clubIds and a non-array pools field', () => {
    const { clubIds: _drop, ...pool } = valid.pools[0]!;
    expect(PyramidDrawSchema.safeParse({ pools: [pool] }).success).toBe(false);
    expect(PyramidDrawSchema.safeParse({ pools: {} }).success).toBe(false);
  });
});

describe('PyramidJoinSchema', () => {
  it('parses an existing-slot join and a new-pool join', () => {
    expect(PyramidJoinSchema.parse({ division: 5, poolId: 'p1', slot: 3, newPool: false })).toEqual({
      division: 5,
      poolId: 'p1',
      slot: 3,
      newPool: false,
    });
    expect(PyramidJoinSchema.parse({ division: 1, poolId: null, slot: 0, newPool: true })).toEqual({
      division: 1,
      poolId: null,
      slot: 0,
      newPool: true,
    });
  });

  it('parses the join request and rejects a missing clubId', () => {
    expect(
      PyramidJoinRequestSchema.parse({ competitionId: 'comp1', clubId: 'cl1' })
    ).toEqual({ competitionId: 'comp1', clubId: 'cl1' });
    expect(PyramidJoinRequestSchema.safeParse({ competitionId: 'comp1' }).success).toBe(false);
  });

  it('rejects a string newPool', () => {
    expect(
      PyramidJoinSchema.safeParse({ division: 1, poolId: null, slot: 0, newPool: 'true' }).success
    ).toBe(false);
  });
});

describe('WorldServiceHealthSchema', () => {
  const valid = {
    status: 'ok',
    service: 'fs-pro-world-service',
    version: 'dev',
    database: 'up',
    uptimeSeconds: 12.5,
    time: '2026-10-07T12:00:00Z',
  };

  it('parses the health payload', () => {
    expect(WorldServiceHealthSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a string uptime and a missing status', () => {
    expect(WorldServiceHealthSchema.safeParse({ ...valid, uptimeSeconds: '12.5' }).success).toBe(false);
    const { status: _drop, ...missing } = valid;
    expect(WorldServiceHealthSchema.safeParse(missing).success).toBe(false);
  });
});
