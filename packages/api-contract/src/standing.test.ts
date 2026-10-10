import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { leagueContract } from './routes/league';
import {
  FormBonusSchema,
  LeagueSignupRequestSchema,
  StandingPoolSchema,
  StandingSchema,
} from './schemas/standing';

describe('league contract (Standing ladder)', () => {
  it('mirrors the Go route ids, paths and status codes', () => {
    const routes = leagueContract as unknown as Record<
      string,
      { method: string; path: string; responses: Record<string, unknown> }
    >;
    const expected: Record<string, [string, string, number[]]> = {
      standing: ['GET', '/league/standing/:clubId', [200, 404]],
      pool: ['GET', '/league/pool/:clubId', [200, 404]],
      signup: ['POST', '/league/signup', [200, 400, 401, 403, 404, 409]],
      formBonus: ['GET', '/league/form-bonus/:clubId', [200, 404]],
    };
    for (const [key, [method, path, statuses]] of Object.entries(expected)) {
      const route = routes[key];
      assert.ok(route, `missing league.${key}`);
      assert.equal(route.method, method, key);
      assert.equal(route.path, path, key);
      assert.deepEqual(
        Object.keys(route.responses)
          .map(Number)
          .sort((a, b) => a - b),
        statuses,
        key
      );
    }
  });

  it('parses payloads shaped exactly like the Go responses', () => {
    const standing = StandingSchema.parse({
      clubId: 'c1',
      points: 1000,
      leagueCode: 'silver_1',
      division: 1,
      multiplierX100: 125,
      rank: 42,
    });
    assert.equal(standing.leagueCode, 'silver_1');
    assert.equal(standing.multiplierX100, 125);

    const pool = StandingPoolSchema.parse({
      weekKey: '2026-W41',
      leagueCode: 'silver_1',
      pool: 0,
      attacks: 3,
      attacksAllowed: 11,
      defenses: 2,
      stars: 7,
      placement: null,
    });
    assert.equal(pool.attacksAllowed, 11);
    assert.equal(pool.placement, null);

    const bonus = FormBonusSchema.parse({
      stars: 4,
      required: 5,
      ready: false,
      nextResetAt: '2026-10-11T12:00:00.000Z',
    });
    assert.equal(bonus.required, 5);
    assert.equal(bonus.ready, false);
  });

  it('validates the signup body', () => {
    assert.equal(
      LeagueSignupRequestSchema.safeParse({ clubId: 'c1' }).success,
      true
    );
    assert.equal(
      LeagueSignupRequestSchema.safeParse({ clubId: '' }).success,
      false
    );
    assert.equal(LeagueSignupRequestSchema.safeParse({}).success, false);
  });
});
