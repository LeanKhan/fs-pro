import type {
  CampusCurrency,
  CampusState,
  CollectorState,
} from '@repo/api-contract';
import { formatCountdown } from './countdown';

/**
 * Pure reads over the campus payload (docs/coc-mapping/04, 05 §3). Kept free of
 * Vue and of the network so the builders queue and the "Collect All" gate can
 * be unit-tested and reused by the HUD, the build panel and the offline report.
 *
 * Every label here is derived from the server's own `now` vs an absolute
 * timestamp — never a local duration (04 §12).
 */

/** One in-flight build in the Groundskeepers' queue. */
export interface BuildJob {
  assetType: string;
  name: string;
  toLevel: number;
  /** Absolute UTC deadline for the upgrade. */
  readyAt: string;
  /** Human label from the server clock: `3h 12m`, `2d 4h`, `ready`. */
  label: string;
}

/**
 * The builders queue: every campus asset currently upgrading, soonest to finish
 * first (the order the Groundskeepers will free up).
 */
export function buildersQueue(campus: CampusState): BuildJob[] {
  return campus.assets
    .filter((asset) => asset.upgrade !== null)
    .map((asset) => {
      const upgrade = asset.upgrade!;
      return {
        assetType: asset.type,
        name: asset.name,
        toLevel: upgrade.toLevel,
        readyAt: upgrade.readyAt,
        label: formatCountdown(upgrade.readyAt, campus.now),
      };
    })
    .sort((a, b) => Date.parse(a.readyAt) - Date.parse(b.readyAt));
}

/** Collectors holding at least one bankable unit right now. */
export function collectableCollectors(campus: CampusState): CollectorState[] {
  return campus.collectors.filter((collector) => collector.pending >= 1);
}

/** Whether a "Collect All" tap would bank anything (the server 409s an empty collect). */
export function canCollectAll(campus: CampusState): boolean {
  return collectableCollectors(campus).length > 0;
}

// --- View models for the campus economy screen (08 §4.1, P1) -----------------

const CURRENCY_LABELS: Record<string, string> = {
  cash: 'Cash',
  fans: 'Fans',
  scout_tokens: 'Scout Tokens',
  sponsor_credits: 'Sponsor Credits',
};

/** Display name for a campus currency. */
export function currencyLabel(currency: string): string {
  return CURRENCY_LABELS[currency] ?? currency;
}

/** A vault as the campus screen shows it: balance against its cap. */
export interface VaultView {
  currency: CampusCurrency;
  label: string;
  level: number;
  balance: number;
  capacity: number;
  /** balance/capacity, clamped 0..1; 0 when the vault has no capacity. */
  fill: number;
  full: boolean;
}

/** Vault balance/cap rows, one per currency the server reports. */
export function vaultsView(campus: CampusState): VaultView[] {
  return campus.vaults.map((v) => {
    const fill =
      v.capacity > 0 ? Math.min(1, Math.max(0, v.balance / v.capacity)) : 0;
    return {
      currency: v.currency,
      label: currencyLabel(v.currency),
      level: v.level,
      balance: v.balance,
      capacity: v.capacity,
      fill,
      full: v.capacity > 0 && v.balance >= v.capacity,
    };
  });
}

/** A collector as the campus screen shows it, with an absolute fill deadline. */
export interface CollectorView {
  key: string;
  name: string;
  currency: CampusCurrency;
  label: string;
  pending: number;
  capacity: number;
  productionPerHour: number;
  /** pending/capacity, clamped 0..1. */
  fill: number;
  full: boolean;
  /**
   * The absolute UTC instant this collector next fills — derived from the
   * server's `collectedAt` + `secondsToFull`, never a local duration. Already
   * full collectors point at their last collection (a past, "ready" instant).
   */
  fullAt: string;
  secondsToFull: number;
}

/** Every collector as a view model, in server order. */
export function collectorViews(campus: CampusState): CollectorView[] {
  return campus.collectors.map((c) => {
    const fill =
      c.capacity > 0 ? Math.min(1, Math.max(0, c.pending / c.capacity)) : 0;
    const base = Date.parse(c.collectedAt);
    const fullAt = Number.isNaN(base)
      ? campus.now
      : new Date(base + Math.max(0, c.secondsToFull) * 1000).toISOString();
    return {
      key: c.key,
      name: c.name,
      currency: c.currency,
      label: currencyLabel(c.currency),
      pending: c.pending,
      capacity: c.capacity,
      productionPerHour: c.productionPerHour,
      fill,
      full: c.full,
      fullAt,
      secondsToFull: c.secondsToFull,
    };
  });
}

/**
 * One countdown the campus screen renders. `at` is an absolute UTC deadline and
 * `serverNow` is the server clock it must be read against (04 §12) — never a
 * duration or a game-day. The host passes both straight to `CozyCountdown`.
 */
export interface CampusTimer {
  key: string;
  kind: 'clubhouse' | 'build' | 'guard';
  label: string;
  at: string;
  serverNow: string;
}

/**
 * Every running campus timer, each anchored to `campus.now`. Covers the
 * Clubhouse tier build, the Groundskeepers' upgrade queue (soonest first) and
 * the Warm-up Guard window.
 */
export function campusTimers(campus: CampusState): CampusTimer[] {
  const out: CampusTimer[] = [];
  const clubhouse = campus.clubhouse;
  if (clubhouse.upgradingTo !== null && clubhouse.readyAt) {
    out.push({
      key: 'clubhouse',
      kind: 'clubhouse',
      label: `Clubhouse → T${clubhouse.upgradingTo}`,
      at: clubhouse.readyAt,
      serverNow: campus.now,
    });
  }
  for (const job of buildersQueue(campus)) {
    out.push({
      key: `build:${job.assetType}`,
      kind: 'build',
      label: `${job.name} → L${job.toLevel}`,
      at: job.readyAt,
      serverNow: campus.now,
    });
  }
  if (campus.guardUntil) {
    out.push({
      key: 'guard',
      kind: 'guard',
      label: 'Warm-up Guard',
      at: campus.guardUntil,
      serverNow: campus.now,
    });
  }
  return out;
}

/**
 * Optimistically bank every collector: its pending is zeroed and its accrual is
 * restarted at `campus.now` (so its fill timer resets). The server's collect
 * response replaces this in full — the optimistic read is cosmetic and the
 * server stays authoritative (08 §4.1).
 */
export function optimisticallyCollected(campus: CampusState): CampusState {
  return {
    ...campus,
    collectors: campus.collectors.map((c) => ({
      ...c,
      pending: 0,
      full: false,
      collectedAt: campus.now,
      secondsToFull:
        c.capacity > 0 && c.productionPerHour > 0
          ? Math.ceil((c.capacity / c.productionPerHour) * 3600)
          : 0,
    })),
  };
}
