import { eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, transferLedger } from '../../db/drizzle/schema';
import { getAssetEffects } from '../facilities/facilities.service';
import { getStanding } from '../world/club-standing.service';
import { scaled } from './game-time';

/**
 * The club shop: the campus's "gold mine" (docs/CORE-LOOP.md). Takings build
 * up every real hour from the fanbase and the seats, up to a storage cap, and
 * the owner taps the coin bubble on the campus to bank them. The last
 * collection time lives in `Clubs.Finances.shopCollectedAt` (no column of its
 * own); a club that has never collected starts with a full till so the first
 * visit has something to tap.
 *
 * Ledger convention: a collection is a TransferLedger row with Type
 * 'shop_income' and `BuyerClubId` the club receiving it.
 */

const db = () => DrizzleDatabase.getInstance().database;

/** Tuning: per design hour, before GAME_TIME_SCALE. */
const BASE_PER_HOUR = 1_500;
const PER_FAN = 6;
const PER_SEAT = 1;
const BASE_STORAGE_HOURS = 6;
const STORAGE_HOURS_PER_STANDS_TIER = 2;

export interface ShopState {
  /** Takings waiting to be collected now. */
  pending: number;
  /** The most the till holds. */
  cap: number;
  /** Takings per real hour at the current game speed. */
  perHour: number;
  /** Seconds until the till is full (0 = full). */
  secondsToFull: number;
}

async function shopRates(clubId: string) {
  const [effects, standing] = await Promise.all([getAssetEffects(clubId), getStanding(clubId)]);
  const capacity = effects.capacity ?? 0;
  const standsTier = Math.max(0, [1_000, 3_000, 8_000, 18_000, 32_000, 55_000].indexOf(capacity));
  const designPerHour = BASE_PER_HOUR + PER_FAN * standing.fans + PER_SEAT * capacity;
  const storageHours = BASE_STORAGE_HOURS + STORAGE_HOURS_PER_STANDS_TIER * standsTier;
  // Faster game time = more takings per real hour, same storage in takings.
  const perHour = designPerHour / scaled(1);
  const cap = Math.round(designPerHour * storageHours);
  return { perHour, cap };
}

function collectedAt(club: Pick<typeof clubs.$inferSelect, 'Finances'>): number | null {
  const at = (club.Finances as { shopCollectedAt?: string } | null)?.shopCollectedAt;
  const ms = at ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function stateFrom(rates: { perHour: number; cap: number }, lastMs: number | null, now: number): ShopState {
  const earned = lastMs === null ? rates.cap : (rates.perHour * Math.max(0, now - lastMs)) / 3_600_000;
  const pending = Math.min(rates.cap, Math.floor(earned));
  const secondsToFull = rates.perHour > 0 ? Math.ceil(((rates.cap - pending) / rates.perHour) * 3600) : 0;
  return { pending, cap: rates.cap, perHour: Math.round(rates.perHour), secondsToFull };
}

export async function getShop(club: typeof clubs.$inferSelect): Promise<ShopState> {
  return stateFrom(await shopRates(club.id), collectedAt(club), Date.now());
}

/** Bank the till. Returns what was collected and the emptied till. */
export async function collectShop(clubId: string): Promise<{ collected: number; shop: ShopState; budget: number }> {
  const [club] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');
  const rates = await shopRates(clubId);
  const now = Date.now();
  const { pending } = stateFrom(rates, collectedAt(club), now);
  if (pending < 1) return { collected: 0, shop: stateFrom(rates, now, now), budget: club.Budget ?? 0 };

  const stamp = new Date(now).toISOString();
  const updated = await db().transaction(async (tx) => {
    // Only the request that still sees the old stamp pays out (no double taps).
    const previous = (club.Finances as { shopCollectedAt?: string } | null)?.shopCollectedAt ?? null;
    const [row] = await tx
      .update(clubs)
      .set({
        Budget: sql`coalesce(${clubs.Budget}, 0) + ${pending}`,
        Finances: sql`jsonb_set(coalesce(${clubs.Finances}, '{}'::jsonb), '{shopCollectedAt}', to_jsonb(${stamp}::text))`,
        updatedAt: new Date(),
      })
      .where(
        previous === null
          ? sql`${clubs.id} = ${clubId} AND (${clubs.Finances} IS NULL OR ${clubs.Finances}->>'shopCollectedAt' IS NULL)`
          : sql`${clubs.id} = ${clubId} AND ${clubs.Finances}->>'shopCollectedAt' = ${previous}`
      )
      .returning({ budget: clubs.Budget });
    if (!row) return null;
    await tx.insert(transferLedger).values({
      Type: 'shop_income',
      BuyerClubId: clubId,
      Amount: pending,
      Note: 'Club shop takings',
      updatedAt: new Date(),
    });
    return row;
  });

  if (!updated) {
    // Someone else (another tab) collected first: report the fresh state.
    const [fresh] = await db().select().from(clubs).where(eq(clubs.id, clubId));
    return { collected: 0, shop: stateFrom(rates, collectedAt(fresh!), now), budget: fresh?.Budget ?? 0 };
  }
  return { collected: pending, shop: stateFrom(rates, now, now), budget: updated.budget ?? 0 };
}
