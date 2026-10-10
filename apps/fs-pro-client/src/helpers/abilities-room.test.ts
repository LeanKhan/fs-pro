import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceAbilities,
  coerceLoadout,
  coerceOrders,
  coerceTraits,
  hasFreeSlot,
  masteryLabel,
  slotLabel,
} from './abilities-room';

const ABILITIES_RAW = {
  clubId: 'c1',
  name: 'Lakeside FC',
  clubhouseTier: 2,
  facilityTier: 1,
  schools: { academy: 1, eliteAcademy: 0, squadCamp: 0, coaching: 1, videoAnalysis: 0 },
  registry: [],
  players: [
    {
      playerId: 'p1',
      name: 'Ada Striker',
      position: 'ST',
      role: 'Poacher',
      family: 'ST',
      masteryTier: 2,
      slots: 2,
      usedSlots: 1,
      slotted: [{ abilityId: 'poacher_sniff', name: 'Poacher Sniff', slot: 0, xp: 700, masteryTier: 2 }],
      syllabus: [
        {
          abilityId: 'poacher_sniff',
          name: 'Poacher Sniff',
          family: 'ST',
          facilityTier: 1,
          masteryTier: 1,
          trigger: 'always',
          mastery: 2,
          eligible: true,
          reason: null,
        },
        {
          abilityId: 'third_man_run',
          name: 'Third-Man Run',
          family: 'ST',
          facilityTier: 3,
          masteryTier: 2,
          trigger: 'always',
          mastery: 1,
          eligible: false,
          reason: 'Third-Man Run needs Coaching tier 3 (you have 1)',
        },
      ],
    },
  ],
};

describe('coerceAbilities', () => {
  it('coerces players, slots and the exact gate reason strings', () => {
    const a = coerceAbilities(ABILITIES_RAW);
    assert.ok(a);
    assert.equal(a.clubId, 'c1');
    assert.equal(a.facilityTier, 1);
    assert.equal(a.players.length, 1);
    const p = a.players[0]!;
    assert.equal(p.slotted[0]!.name, 'Poacher Sniff');
    assert.equal(p.syllabus[0]!.eligible, true);
    assert.equal(p.syllabus[0]!.reason, null);
    assert.match(p.syllabus[1]!.reason ?? '', /Coaching tier 3/);
  });

  it('returns null without a club id', () => {
    assert.equal(coerceAbilities({ players: [] }), null);
  });
});

describe('slot helpers', () => {
  it('reports free slots and usage', () => {
    const p = coerceAbilities(ABILITIES_RAW)!.players[0]!;
    assert.equal(hasFreeSlot(p), true);
    assert.equal(slotLabel(p), '1 / 2');
  });

  it('reports no free slot when full', () => {
    const p = { ...coerceAbilities(ABILITIES_RAW)!.players[0]!, usedSlots: 2 };
    assert.equal(hasFreeSlot(p), false);
  });

  it('labels mastery tiers', () => {
    assert.equal(masteryLabel(3), 'Tier 3');
    assert.equal(masteryLabel(-1), 'Tier 0');
  });
});

describe('coerceTraits', () => {
  it('keeps the catalogue, rarities and slot cap', () => {
    const cat = coerceTraits({
      traits: [{ id: 'engine', name: 'Engine', description: 'Runs', rarity: 'shiny', effect: 'stamina' }],
      rarities: ['shiny', 'glowy', 'starry'],
      maxSlots: 2,
    });
    assert.ok(cat);
    assert.equal(cat.traits[0]!.id, 'engine');
    assert.equal(cat.maxSlots, 2);
    assert.deepEqual(cat.rarities, ['shiny', 'glowy', 'starry']);
  });

  it('defaults a missing slot cap to 2', () => {
    assert.equal(coerceTraits({ traits: [] })!.maxSlots, 2);
  });
});

describe('coerceOrders', () => {
  it('coerces the War-Room inventory with an optional region', () => {
    const inv = coerceOrders({
      clubId: 'c1',
      name: 'Lakeside FC',
      fans: 4200,
      orders: [
        { id: 'overload_flank', name: 'Overload Flank', description: 'x', cost: 300, trigger: 'always', count: 2, max: 5, region: { x0: 6, x1: 8, y0: 0, y1: 6 } },
        { id: 'press_trap', name: 'Press Trap', description: 'y', cost: 200, count: 0, max: 5 },
      ],
    });
    assert.ok(inv);
    assert.equal(inv.fans, 4200);
    assert.deepEqual(inv.orders[0]!.region, { x0: 6, x1: 8, y0: 0, y1: 6 });
    assert.equal(inv.orders[1]!.region, null);
    assert.equal(inv.orders[1]!.trigger, 'always');
  });

  it('returns null without a club id', () => {
    assert.equal(coerceOrders({ orders: [] }), null);
  });
});

describe('coerceLoadout', () => {
  it('coerces the slot/equip echo', () => {
    const l = coerceLoadout({
      playerId: 'p1',
      masteryTier: 2,
      slots: 2,
      usedSlots: 1,
      slotted: [{ abilityId: 'poacher_sniff', slot: 0, xp: 700, masteryTier: 2 }],
      mastery: [{ abilityId: 'poacher_sniff', xp: 700, tier: 2 }],
      traits: [{ traitId: 'engine', slot: 0, rarity: 'shiny' }],
    });
    assert.ok(l);
    assert.equal(l.slotted[0]!.abilityId, 'poacher_sniff');
    assert.equal(l.mastery[0]!.tier, 2);
    assert.equal(l.traits[0]!.traitId, 'engine');
  });

  it('returns null without a player id', () => {
    assert.equal(coerceLoadout({ slots: 2 }), null);
  });
});
