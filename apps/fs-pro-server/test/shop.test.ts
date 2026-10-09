import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for src/services/play/shop.ts rates.
 *
 * shop.ts computes its rates in an un-exported `shopRates`, which is not a
 * pure function (it awaits getAssetEffects + getStanding). The public
 * `getShop` does no DB work of its own, so we mock those two dependencies
 * and exercise the real rate/storage/pending maths through `getShop`.
 *
 * Tuning (src/services/play/shop.ts:22-27): BASE_PER_HOUR 1500, PER_FAN 6,
 * PER_SEAT 1, BASE_STORAGE_HOURS 6, STORAGE_HOURS_PER_STANDS_TIER 2. Seat
 * tiers (line 43): 1k, 3k, 8k, 18k, 32k, 55k; an unknown capacity is tier 0.
 */

const deps = vi.hoisted(() => ({ capacity: 0, fans: 0 }));

vi.mock('../src/services/facilities/facilities.service', () => ({
  getAssetEffects: vi.fn(async () => ({ capacity: deps.capacity })),
}));

vi.mock('../src/services/world/club-standing.service', () => ({
  getStanding: vi.fn(async () => ({
    fans: deps.fans,
    reputation: 50,
    boardConfidence: 60,
    fanApproval: 55,
    squadMorale: 60,
    form: [],
    streak: null,
  })),
}));

import { getShop } from '../src/services/play/shop';
import { GAME_TIME_SCALE } from '../src/services/play/game-time';

type ShopClub = Parameters<typeof getShop>[0];
const club = (finances: unknown): ShopClub =>
  ({ id: 'club-1', Finances: finances, Budget: 0 }) as unknown as ShopClub;

/** designPerHour = 1500 + 6*fans + capacity; cap = design*storageHours. */
function expectedRates(fans: number, capacity: number) {
  const seatTiers = [1_000, 3_000, 8_000, 18_000, 32_000, 55_000];
  const standsTier = Math.max(0, seatTiers.indexOf(capacity));
  const designPerHour = 1_500 + 6 * fans + capacity;
  const storageHours = 6 + 2 * standsTier;
  return {
    designPerHour,
    storageHours,
    perHour: designPerHour * GAME_TIME_SCALE,
    cap: Math.round(designPerHour * storageHours),
  };
}

beforeEach(() => {
  deps.capacity = 0;
  deps.fans = 0;
});

describe('getShop rates', () => {
  it('a brand-new club (no collection stamp) starts with a full till', async () => {
    const { cap, perHour } = expectedRates(0, 0);
    expect(cap).toBe(9_000); // (1500) * 6
    const shop = await getShop(club(null));
    expect(shop.cap).toBe(9_000);
    expect(shop.perHour).toBe(Math.round(perHour));
    expect(shop.pending).toBe(9_000);
    expect(shop.secondsToFull).toBe(0);
  });

  it('fanbase and a known stand tier feed the rate and the storage cap', async () => {
    deps.fans = 1_000;
    deps.capacity = 3_000; // tier index 1 -> storage 8 hours
    const { designPerHour, cap, perHour } = expectedRates(1_000, 3_000);
    expect(designPerHour).toBe(10_500); // 1500 + 6000 + 3000
    expect(cap).toBe(84_000); // 10500 * 8

    const paidAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const shop = await getShop(club({ shopCollectedAt: paidAt }));
    expect(shop.cap).toBe(84_000);
    expect(shop.perHour).toBe(Math.round(perHour));
    expect(shop.pending).toBe(Math.floor(Math.min(cap, perHour)));
    expect(shop.secondsToFull).toBe(25_200); // remaining 7 design-hours
  });

  it('an unknown capacity falls back to stand tier 0', async () => {
    deps.fans = 0;
    deps.capacity = 1_234; // not one of the six tiers
    const { cap } = expectedRates(0, 1_234);
    expect(cap).toBe(16_404); // (1500 + 1234) * 6 storage hours
    const shop = await getShop(club(null));
    expect(shop.cap).toBe(16_404);
  });

  it('a long wait is capped at the till capacity', async () => {
    deps.fans = 2_000;
    deps.capacity = 55_000; // tier index 5 -> storage 16 hours
    const { cap } = expectedRates(2_000, 55_000);
    expect(cap).toBe(Math.round((1_500 + 12_000 + 55_000) * 16));
    const longAgo = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
    const shop = await getShop(club({ shopCollectedAt: longAgo }));
    expect(shop.pending).toBe(cap);
    expect(shop.secondsToFull).toBe(0);
  });

  it('an unparseable collection stamp is treated as never collected', async () => {
    deps.fans = 0;
    deps.capacity = 0;
    const shop = await getShop(club({ shopCollectedAt: 'not-a-date' }));
    expect(shop.pending).toBe(9_000);
  });
});
