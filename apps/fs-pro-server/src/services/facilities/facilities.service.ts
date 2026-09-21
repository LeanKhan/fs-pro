import { and, eq, isNotNull, lte, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubAssets, clubs, transferLedger } from '../../db/drizzle/schema';
import { getCalendar } from '../../controllers/calendar/calendar.service';
import {
  ASSET_CONFIG,
  ASSET_TYPES,
  MAX_ASSET_LEVEL,
  MAX_CONCURRENT_UPGRADES,
  isAssetType,
  upgradeCost,
  upgradeDays,
  type AssetType,
} from './asset-config';

/**
 * Club facilities (the "build your club" loop): pay cash, wait calendar days,
 * the asset levels up. Upgrades resolve on the game calendar - see
 * completeDueUpgrades, called from advanceDayIfDone - so they progress while
 * the owner is offline, and follow pause/speed of the live clock.
 *
 * Ledger convention: a start-of-upgrade spend is a TransferLedger row with
 * Type 'facility', `BuyerClubId` the paying club and `Note` the asset + level.
 */

const db = () => DrizzleDatabase.getInstance().database;

export interface AssetState {
  type: AssetType;
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  effectLabel: string;
  effects: Record<string, number>;
  upgrade: { toLevel: number; startDay: number; completeDay: number; daysLeft: number } | null;
  /** Null when at max level. */
  next: {
    level: number;
    cost: number;
    days: number;
    effectLabel: string;
    /** Why it cannot be started right now, or null if it can. */
    blockedReason: string | null;
  } | null;
}

export interface CampusState {
  clubId: string;
  budget: number;
  currentDay: number;
  maxConcurrentUpgrades: number;
  activeUpgrades: number;
  assets: AssetState[];
}

async function levelsFor(clubId: string) {
  const rows = await db().select().from(clubAssets).where(eq(clubAssets.ClubId, clubId));
  return new Map(rows.map((r) => [r.AssetType, r]));
}

export async function getCampus(clubId: string): Promise<CampusState> {
  const club = await db().query.clubs.findFirst({ where: eq(clubs.id, clubId) });
  if (!club) throw new Error('Club not found');

  const calendar = await getCalendar();
  const rows = await levelsFor(clubId);
  const budget = club.Budget ?? 0;
  const activeUpgrades = [...rows.values()].filter((r) => r.UpgradingTo !== null).length;

  const assets = ASSET_TYPES.map((type): AssetState => {
    const def = ASSET_CONFIG[type];
    const row = rows.get(type);
    const level = row?.Level ?? 0;
    const upgrading = row?.UpgradingTo != null && row.CompleteDay != null;

    let next: AssetState['next'] = null;
    if (level < MAX_ASSET_LEVEL) {
      const target = level + 1;
      const cost = upgradeCost(type, target);
      let blockedReason: string | null = null;
      if (upgrading) blockedReason = 'Already upgrading';
      else if (activeUpgrades >= MAX_CONCURRENT_UPGRADES) blockedReason = 'All builders are busy';
      else {
        const missing = (def.requires ?? []).find(
          (r) => (rows.get(r.type)?.Level ?? 0) < target - r.levelOffset
        );
        if (missing) {
          blockedReason = `Requires ${ASSET_CONFIG[missing.type].name} level ${target - missing.levelOffset}`;
        } else if (budget < cost) blockedReason = 'Insufficient budget';
      }
      next = {
        level: target,
        cost,
        days: upgradeDays(type, target),
        effectLabel: def.effectLabel(target),
        blockedReason,
      };
    }

    return {
      type,
      name: def.name,
      description: def.description,
      level,
      maxLevel: MAX_ASSET_LEVEL,
      effectLabel: def.effectLabel(level),
      effects: def.effects(level),
      upgrade: upgrading
        ? {
            toLevel: row!.UpgradingTo!,
            startDay: row!.StartDay ?? calendar.CurrentDay,
            completeDay: row!.CompleteDay!,
            daysLeft: Math.max(row!.CompleteDay! - calendar.CurrentDay, 0),
          }
        : null,
      next,
    };
  });

  return {
    clubId,
    budget,
    currentDay: calendar.CurrentDay,
    maxConcurrentUpgrades: MAX_CONCURRENT_UPGRADES,
    activeUpgrades,
    assets,
  };
}

/**
 * Pays for and starts the next level of an asset. The budget debit is a
 * conditional UPDATE (Budget >= cost), so two racing requests cannot
 * overspend; everything happens in one transaction.
 */
export async function startUpgrade(clubId: string, assetType: string): Promise<CampusState> {
  if (!isAssetType(assetType)) throw new Error(`Unknown asset type "${assetType}"`);
  const type = assetType;
  const def = ASSET_CONFIG[type];
  const calendar = await getCalendar();

  await db().transaction(async (tx) => {
    const club = await tx.query.clubs.findFirst({ where: eq(clubs.id, clubId) });
    if (!club) throw new Error('Club not found');

    const rows = await tx.select().from(clubAssets).where(eq(clubAssets.ClubId, clubId));
    const byType = new Map(rows.map((r) => [r.AssetType, r]));
    const existing = byType.get(type);
    const level = existing?.Level ?? 0;
    const target = level + 1;

    if (existing?.UpgradingTo != null) throw new Error(`${def.name} is already being upgraded`);
    if (level >= MAX_ASSET_LEVEL) throw new Error(`${def.name} is already at max level`);
    if (rows.filter((r) => r.UpgradingTo !== null).length >= MAX_CONCURRENT_UPGRADES) {
      throw new Error('All builders are busy - wait for the current upgrade to finish');
    }
    for (const req of def.requires ?? []) {
      const needed = target - req.levelOffset;
      if ((byType.get(req.type)?.Level ?? 0) < needed) {
        throw new Error(`${def.name} level ${target} requires ${ASSET_CONFIG[req.type].name} level ${needed}`);
      }
    }

    const cost = upgradeCost(type, target);
    const debited = await tx
      .update(clubs)
      .set({ Budget: drizzleSql`coalesce(${clubs.Budget}, 0) - ${cost}`, updatedAt: new Date() })
      .where(and(eq(clubs.id, clubId), drizzleSql`coalesce(${clubs.Budget}, 0) >= ${cost}`))
      .returning({ id: clubs.id });
    if (!debited.length) throw new Error('Insufficient budget');

    const patch = {
      UpgradingTo: target,
      StartDay: calendar.CurrentDay,
      CompleteDay: calendar.CurrentDay + upgradeDays(type, target),
      updatedAt: new Date(),
    };
    if (existing) {
      await tx.update(clubAssets).set(patch).where(eq(clubAssets.id, existing.id));
    } else {
      await tx.insert(clubAssets).values({ ClubId: clubId, AssetType: type, Level: 0, ...patch });
    }

    await tx.insert(transferLedger).values({
      Type: 'facility',
      BuyerClubId: clubId,
      Amount: cost,
      Note: `${def.name} -> level ${target}`,
      updatedAt: new Date(),
    });
  });

  return getCampus(clubId);
}

/**
 * Finishes every upgrade whose CompleteDay has been reached. One atomic,
 * idempotent statement - safe to call on every calendar advance (including
 * admin jumps that skip many days) and from several instances. Returns the
 * completed (clubId, assetType, level) rows.
 */
export async function completeDueUpgrades(currentDay: number) {
  return db()
    .update(clubAssets)
    .set({
      Level: drizzleSql`${clubAssets.UpgradingTo}`,
      UpgradingTo: null,
      StartDay: null,
      CompleteDay: null,
      updatedAt: new Date(),
    })
    .where(and(isNotNull(clubAssets.UpgradingTo), lte(clubAssets.CompleteDay, currentDay)))
    .returning({
      clubId: clubAssets.ClubId,
      assetType: clubAssets.AssetType,
      level: clubAssets.Level,
    });
}

/** Numeric effects of a club's current facility levels (for game systems). */
export async function getAssetEffects(clubId: string): Promise<Record<string, number>> {
  const rows = await levelsFor(clubId);
  const out: Record<string, number> = {};
  for (const type of ASSET_TYPES) {
    Object.assign(out, ASSET_CONFIG[type].effects(rows.get(type)?.Level ?? 0));
  }
  return out;
}
