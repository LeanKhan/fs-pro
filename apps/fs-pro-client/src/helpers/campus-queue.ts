import type { CampusState, CollectorState } from '@repo/api-contract';
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
