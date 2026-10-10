/**
 * The Club Legacy surface's pure core (docs/coc-mapping/02 §I/§K, 04 §2,
 * 08 §2 P8, OW-N10).
 *
 * The Club Legacy chain is the long-horizon objective ladder whose completion
 * grants the 6th Groundskeeper; Club Honours are the long-horizon milestones
 * that award Sponsor Credits / Board Perks. Both `legacy.get` and
 * `honours.list` return untyped Go maps, so this module coerces them into
 * render-safe view models and labels the seeded chain steps.
 *
 * Pure: no Vue, no network, no clock. Unit-tested in `legacy-chain.test.ts`.
 */
import { bool, int, isRecord, list, num, record, str } from './coerce';

/** The human label for each seeded chain step (internal/legacy.Chain). */
export const LEGACY_STEP_LABEL: Record<string, string> = {
  'first-grounds': 'Break ground on the first facility',
  'first-raid-win': 'Win your first ranked fixture',
  'clean-sheet-streak': 'Keep clean sheets in a row',
  'promote-a-teen': 'Promote an academy player',
  'cup-run': 'Reach a cup run',
  'fortress-home': 'Build a home fortress',
  'hundred-fixtures': 'Play a hundred fixtures',
  'club-legend': 'Become a club legend',
};

/** One chain step. */
export interface LegacyStepView {
  id: string;
  label: string;
  /** Stars this step requires (1-3). */
  stars: number;
  /** Stars earned so far (monotonic). */
  progress: number;
  met: boolean;
  /** progress/stars, clamped 0..1. */
  fill: number;
}

/** One Club Honour. */
export interface HonourView {
  code: string;
  title: string;
  goal: number;
  progress: number;
  complete: boolean;
  completed: boolean;
  fill: number;
  reward: {
    cash: number;
    fans: number;
    sponsorCredits: number;
    perks: { key: string; count: number }[];
  };
}

/** The Club Legacy read model. */
export interface LegacyView {
  clubId: string;
  name: string;
  chain: LegacyStepView[];
  totalStars: number;
  maxStars: number;
  complete: boolean;
  /** 1 once the 6th Groundskeeper has been (or can be) granted. */
  granted: number;
  groundskeepers: { count: number; max: number };
  honours: HonourView[];
}

function stepOf(raw: unknown): LegacyStepView | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const stars = Math.max(1, int(raw.stars, 1));
  const progress = Math.max(0, int(raw.progress, 0));
  return {
    id,
    label: LEGACY_STEP_LABEL[id] ?? prettify(id),
    stars,
    progress,
    met: bool(raw.met, progress >= stars),
    fill: Math.min(1, progress / stars),
  };
}

function honourOf(raw: unknown): HonourView | null {
  if (!isRecord(raw)) return null;
  const code = str(raw.code);
  if (!code) return null;
  const goal = Math.max(1, int(raw.goal, 1));
  const progress = Math.max(0, int(raw.progress, 0));
  const reward = record(raw.reward);
  const perksRaw = record(reward.perks);
  const perks = Object.keys(perksRaw)
    .map((key) => ({ key, count: int(perksRaw[key], 0) }))
    .filter((p) => p.count > 0);
  return {
    code,
    title: str(raw.title, prettify(code)),
    goal,
    progress,
    complete: bool(raw.complete, progress >= goal),
    completed: bool(raw.completed),
    fill: Math.min(1, progress / goal),
    reward: {
      cash: num(reward.cash, 0),
      fans: int(reward.fans, 0),
      sponsorCredits: int(reward.sponsorCredits, 0),
      perks,
    },
  };
}

/** `first-raid-win` → `First raid win`. */
export function prettify(key: string): string {
  const words = key.split(/[-_]/).filter(Boolean);
  if (!words.length) return key;
  return words
    .map((w, i) =>
      i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase()
    )
    .join(' ');
}

/** Coerce a `legacy.get` payload, or null when malformed. */
export function coerceLegacy(raw: unknown): LegacyView | null {
  if (!isRecord(raw)) return null;
  const clubId = str(raw.clubId);
  if (!clubId) return null;
  const gk = record(raw.groundskeepers);
  return {
    clubId,
    name: str(raw.name, 'Club'),
    chain: list(raw.chain)
      .map(stepOf)
      .filter((s): s is LegacyStepView => s !== null),
    totalStars: int(raw.totalStars, 0),
    maxStars: int(raw.maxStars, 0),
    complete: bool(raw.complete),
    granted: int(raw.granted, 0),
    groundskeepers: {
      count: int(gk.count, 0),
      max: int(gk.max, 0),
    },
    honours: list(raw.honours)
      .map(honourOf)
      .filter((h): h is HonourView => h !== null),
  };
}

/** Coerce an `honours.list` payload, or null when malformed. */
export function coerceHonours(raw: unknown): {
  clubId: string;
  name: string;
  honours: HonourView[];
} | null {
  if (!isRecord(raw)) return null;
  const clubId = str(raw.clubId);
  if (!clubId) return null;
  return {
    clubId,
    name: str(raw.name, 'Club'),
    honours: list(raw.honours)
      .map(honourOf)
      .filter((h): h is HonourView => h !== null),
  };
}

/** The number of remaining (unmet) chain steps. */
export function remainingSteps(legacy: LegacyView): number {
  return legacy.chain.filter((s) => !s.met).length;
}

/** Whether the Legacy claim button should be offered. */
export function legacyClaimable(legacy: LegacyView): boolean {
  return legacy.complete && legacy.granted === 0;
}
