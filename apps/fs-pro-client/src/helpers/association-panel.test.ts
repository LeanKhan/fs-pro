import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceAssociation,
  coerceDerby,
  coerceDirectives,
  directivePerks,
  festivalLabel,
  isMember,
  tierLabel,
} from './association-panel';

const ASSOC_RAW = {
  id: 'a1',
  name: 'Northern Alliance',
  tag: 'NALL',
  description: 'A friendly crew',
  level: 3,
  xp: 420,
  memberCount: 2,
  maxMembers: 50,
  open: true,
  region: 'North',
  loanSlots: 2,
  perks: { vaultBonusPct: 0.05, incomeBonusPct: 0.1 },
  members: [
    { clubId: 'c1', role: 'leader', name: 'Lakeside FC', code: 'LAK' },
    { clubId: 'c2', role: 'member', name: 'Riverside FC', code: 'RIV' },
  ],
  grounds: {
    associationId: 'a1',
    level: 2,
    maxLevel: 5,
    capitalGold: 1500,
    nextCost: 3000,
    festivalActive: true,
    festivalClosesAt: '2026-10-12T07:00:00.000Z',
  },
};

describe('coerceAssociation', () => {
  it('coerces the roster, perks and grounds', () => {
    const a = coerceAssociation(ASSOC_RAW);
    assert.ok(a);
    assert.equal(a.name, 'Northern Alliance');
    assert.equal(a.members[0]!.isLeader, true);
    assert.equal(a.members[1]!.isLeader, false);
    assert.equal(a.perks.incomeBonusPct, 0.1);
    assert.equal(a.grounds!.fill, 0.5);
    assert.equal(a.grounds!.festivalActive, true);
    assert.equal(a.grounds!.festivalClosesAt, '2026-10-12T07:00:00.000Z');
    assert.equal(a.grounds!.maxed, false);
  });

  it('returns null without an id', () => {
    assert.equal(coerceAssociation({ name: 'x' }), null);
  });

  it('handles an association with no grounds yet', () => {
    const a = coerceAssociation({ id: 'a1', name: 'Fresh', members: [] });
    assert.ok(a);
    assert.equal(a.grounds, null);
    assert.deepEqual(a.members, []);
  });

  it('marks maxed grounds as full', () => {
    const a = coerceAssociation({
      id: 'a1',
      name: 'Maxed',
      grounds: { level: 5, maxLevel: 5, capitalGold: 0, nextCost: 0 },
    })!;
    assert.equal(a.grounds!.maxed, true);
    assert.equal(a.grounds!.fill, 1);
  });
});

describe('isMember', () => {
  it('detects the caller club in the roster', () => {
    const a = coerceAssociation(ASSOC_RAW)!;
    assert.equal(isMember(a, 'c1'), true);
    assert.equal(isMember(a, 'c9'), false);
  });
});

describe('festivalLabel', () => {
  it('reflects the Festival window', () => {
    const a = coerceAssociation(ASSOC_RAW)!;
    assert.equal(festivalLabel(a.grounds!), 'Festival Weekend live');
    const closed = coerceAssociation({ id: 'a1', name: 'x', grounds: { level: 1, maxLevel: 5, festivalActive: false } })!;
    assert.equal(festivalLabel(closed.grounds!), 'Festival closed');
  });
});

describe('coerceDirectives', () => {
  it('coerces the weekly board with progress and claim state', () => {
    const d = coerceDirectives({
      associationId: 'a1',
      weekKey: '2026-W41',
      directives: [
        { id: 'd1', code: 'matches', title: 'Play 5 matches', tier: 1, goal: 5, progress: 5, claimedTier: 0, canClaim: true, rewards: { cash: 500, fans: 200 } },
        { id: 'd2', code: 'wins', title: 'Win 3 matches', tier: 2, goal: 3, progress: 1, claimedTier: 0, canClaim: false, rewards: { cash: 1000, perks: { resource_cache: 1 } } },
      ],
    });
    assert.ok(d);
    assert.equal(d.weekKey, '2026-W41');
    assert.equal(d.directives[0]!.fill, 1);
    assert.equal(d.directives[0]!.canClaim, true);
    assert.deepEqual(directivePerks(d.directives[1]!), ['resource_cache']);
    assert.equal(d.directives[1]!.fill, 1 / 3);
  });

  it('returns null without an association id', () => {
    assert.equal(coerceDirectives({ directives: [] }), null);
  });
});

describe('coerceDerby', () => {
  it('coerces the lifecycle with absolute instants', () => {
    const derby = coerceDerby({
      id: 'dby1',
      homeAssocId: 'a1',
      awayAssocId: 'a2',
      phase: 'battle',
      homeStars: 4,
      awayStars: 2,
      homeDestruction: 61.5,
      awayDestruction: 20.2,
      prepStartsAt: '2026-10-09T07:00:00.000Z',
      battleStartsAt: '2026-10-10T07:00:00.000Z',
      endsAt: '2026-10-12T07:00:00.000Z',
      completedAt: null,
      practice: false,
      result: 'home',
      matches: [{ id: 'm1', attackerClubId: 'c1', defenderClubId: 'c2', attempt: 1, stars: 2, destruction: 40 }],
    });
    assert.ok(derby);
    assert.equal(derby.phase, 'battle');
    assert.equal(derby.endsAt, '2026-10-12T07:00:00.000Z');
    assert.equal(derby.matches[0]!.stars, 2);
    assert.equal(derby.result, 'home');
  });

  it('defaults an unknown result to a draw', () => {
    assert.equal(coerceDerby({ id: 'd', result: 'nonsense' })!.result, 'draw');
  });
});

describe('tierLabel', () => {
  it('renders roman tiers with a fallback', () => {
    assert.equal(tierLabel(1), 'I');
    assert.equal(tierLabel(3), 'III');
    assert.equal(tierLabel(9), 'T9');
  });
});
