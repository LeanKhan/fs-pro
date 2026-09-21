import { and, eq, isNotNull, lte, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubAssets, clubs, transferLedger } from '../../db/drizzle/schema';
import {
  ASSET_CONFIG,
  ASSET_TYPES,
  MAX_ASSET_LEVEL,
  MAX_CONCURRENT_UPGRADES,
  isAssetType,
  upgradeCost,
  upgradeMinutes,
  type AssetType,
} from './asset-config';

/**
 * Club facilities (the "build your club" loop): pay cash, wait calendar days,
 * the asset levels up. Timers are REAL time (StartAt/CompleteAt). They are
 * resolved lazily on every read (completeDueUpgrades) and by a periodic sweep
 * (startFacilitiesSweep), so they finish while the owner is offline.
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
  upgrade: { toLevel: number; startAt: string; completeAt: string; secondsLeft: number } | null;
  /** Null when at max level. */
  next: {
    level: number;
    cost: number;
    minutes: number;
    effectLabel: string;
    /** Why it cannot be started right now, or null if it can. */
    blockedReason: string | null;
  } | null;
}

export interface CampusState {
  clubId: string;
  budget: number;
  maxConcurrentUpgrades: number;
  activeUpgrades: number;
  assets: AssetState[];
}

async function levelsFor(clubId: string) {
  const rows = await db().select().from(clubAssets).where(eq(clubAssets.ClubId, clubId));
  return new Map(rows.map((r) => [r.AssetType, r]));
}

/** A club with no row for an asset is at Level 0 - the from-scratch start of
 * a newly created club. Clubs that existed before facilities were introduced
 * got real rows from scripts/migration/backfill-club-assets.ts. */
const levelIn = (rows: Map<string, typeof clubAssets.$inferSelect>, t: AssetType) =>
  rows.get(t)?.Level ?? 0;

export async function getCampus(clubId: string): Promise<CampusState> {
  const club = await db().query.clubs.findFirst({ where: eq(clubs.id, clubId) });
  if (!club) throw new Error('Club not found');

  await completeDueUpgrades();
  const now = Date.now();
  const rows = await levelsFor(clubId);
  const levelOf = (t: AssetType) => levelIn(rows, t);
  const budget = club.Budget ?? 0;
  const activeUpgrades = [...rows.values()].filter((r) => r.UpgradingTo !== null).length;

  const assets = ASSET_TYPES.map((type): AssetState => {
    const def = ASSET_CONFIG[type];
    const row = rows.get(type);
    const level = levelOf(type);
    const upgrading = row?.UpgradingTo != null && row.CompleteAt != null;

    let next: AssetState['next'] = null;
    if (level < MAX_ASSET_LEVEL) {
      const target = level + 1;
      const cost = upgradeCost(type, target);
      let blockedReason: string | null = null;
      if (upgrading) blockedReason = 'Already upgrading';
      else if (activeUpgrades >= MAX_CONCURRENT_UPGRADES) blockedReason = 'All builders are busy';
      else {
        const missing = (def.requires ?? []).find(
          (r) => levelOf(r.type) < target - r.levelOffset
        );
        if (missing) {
          blockedReason = `Requires ${ASSET_CONFIG[missing.type].name} level ${target - missing.levelOffset}`;
        } else if (budget < cost) blockedReason = 'Insufficient budget';
      }
      next = {
        level: target,
        cost,
        minutes: upgradeMinutes(type, target),
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
            startAt: (row!.StartAt ?? row!.CompleteAt!).toISOString(),
            completeAt: row!.CompleteAt!.toISOString(),
            secondsLeft: Math.max(Math.ceil((row!.CompleteAt!.getTime() - now) / 1000), 0),
          }
        : null,
      next,
    };
  });

  return {
    clubId,
    budget,
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
  await completeDueUpgrades();
  const startedAt = new Date();

  await db().transaction(async (tx) => {
    const club = await tx.query.clubs.findFirst({ where: eq(clubs.id, clubId) });
    if (!club) throw new Error('Club not found');

    const rows = await tx.select().from(clubAssets).where(eq(clubAssets.ClubId, clubId));
    const byType = new Map(rows.map((r) => [r.AssetType, r]));
    const existing = byType.get(type);
    const levelOf = (t: AssetType) => levelIn(byType, t);
    const level = levelOf(type);
    const target = level + 1;

    if (existing?.UpgradingTo != null) throw new Error(`${def.name} is already being upgraded`);
    if (level >= MAX_ASSET_LEVEL) throw new Error(`${def.name} is already at max level`);
    if (rows.filter((r) => r.UpgradingTo !== null).length >= MAX_CONCURRENT_UPGRADES) {
      throw new Error('All builders are busy - wait for the current upgrade to finish');
    }
    for (const req of def.requires ?? []) {
      const needed = target - req.levelOffset;
      if (levelOf(req.type) < needed) {
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
      StartAt: startedAt,
      CompleteAt: new Date(startedAt.getTime() + upgradeMinutes(type, target) * 60_000),
      updatedAt: new Date(),
    };
    if (existing) {
      await tx.update(clubAssets).set(patch).where(eq(clubAssets.id, existing.id));
    } else {
      await tx.insert(clubAssets).values({ ClubId: clubId, AssetType: type, Level: level, ...patch });
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
 * Finishes every upgrade whose CompleteAt has passed. One atomic, idempotent
 * statement - safe to call on every read, from the periodic sweep, and from
 * several instances. Returns the completed (clubId, assetType, level) rows.
 */
export async function completeDueUpgrades(now: Date = new Date()) {
  return db()
    .update(clubAssets)
    .set({
      Level: drizzleSql`${clubAssets.UpgradingTo}`,
      UpgradingTo: null,
      StartAt: null,
      CompleteAt: null,
      StartDay: null,
      CompleteDay: null,
      updatedAt: new Date(),
    })
    .where(and(isNotNull(clubAssets.UpgradingTo), lte(clubAssets.CompleteAt, now)))
    .returning({
      clubId: clubAssets.ClubId,
      assetType: clubAssets.AssetType,
      level: clubAssets.Level,
    });
}

let sweepTimer: NodeJS.Timeout | null = null;

/** Periodically finishes due upgrades so they complete with nobody online. */
export function startFacilitiesSweep(intervalMs = 15_000) {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    completeDueUpgrades()
      .then((done) => {
        if (done.length) console.log(`[facilities] ${done.length} upgrade(s) completed`);
      })
      .catch((err) => console.error('[facilities] sweep failed:', err));
  }, intervalMs);
  sweepTimer.unref();
  console.log('[facilities] upgrade sweep started');
}

/** Numeric effects of a club's current facility levels (for game systems). */
export async function getAssetEffects(clubId: string): Promise<Record<string, number>> {
  await completeDueUpgrades();
  const rows = await levelsFor(clubId);
  const out: Record<string, number> = {};
  for (const type of ASSET_TYPES) {
    Object.assign(out, ASSET_CONFIG[type].effects(levelIn(rows, type)));
  }
  return out;
}
