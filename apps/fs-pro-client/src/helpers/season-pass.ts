/**
 * The Season surface's pure core (docs/coc-mapping/04 §6-§7, 08 §2 P8, OW-N10).
 *
 * `season.get` returns the monthly Season read model as an untyped Go map:
 * points → tier, the individual/shared Objective catalogue with server-evaluated
 * progress, per-tier Silver (free) / Gold (pass) rewards and claim state, the
 * Season Bank, and the Board Perk inventory (`Clubs.Perks`). This module coerces
 * that payload into a render-safe view model — never trusting the client for
 * completion — and derives the claim gates the buttons use.
 *
 * Pure: no Vue, no network, no clock. Unit-tested in `season-pass.test.ts`.
 */
import {
  bool,
  counts,
  int,
  isRecord,
  list,
  num,
  nullableStr,
  record,
  str,
} from './coerce';

/** One reward bundle (currency + Board Perks). */
export interface SeasonRewardView {
  cash: number;
  fans: number;
  scoutTokens: number;
  sponsorCredits: number;
  perks: { key: string; count: number }[];
  isEmpty: boolean;
}

/** One monthly objective. */
export interface SeasonObjectiveView {
  id: string;
  code: string;
  title: string;
  points: number;
  goal: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  /** "individual" | "shared". */
  scope: string;
  /** Never negative: progress/goal clamped for the bar. */
  fill: number;
}

/** One Silver/Gold tier row. */
export interface SeasonTierView {
  tier: number;
  points: number;
  silver: SeasonRewardView;
  gold: SeasonRewardView;
  silverClaimed: boolean;
  goldClaimed: boolean;
  silverClaimable: boolean;
  goldClaimable: boolean;
}

/** The Season Bank (accrues, claimed at season end). */
export interface SeasonBankView {
  accrued: number;
  claimed: number;
  claimable: number;
  open: boolean;
  endsAt: string | null;
}

/** One Board Perk inventory line. */
export interface SeasonPerkView {
  key: string;
  name: string;
  category: string;
  count: number;
}

/** Progress from the previous tier threshold to the next. */
export interface SeasonProgressView {
  current: number;
  next: number | null;
  /** 0..1 between the two thresholds. */
  pct: number;
}

/** The whole Season read model as the surface consumes it. */
export interface SeasonView {
  clubId: string;
  name: string;
  seasonKey: string;
  points: number;
  tier: number;
  maxTier: number;
  nextThreshold: number;
  hasPass: boolean;
  silverClaimedTier: number;
  goldClaimedTier: number;
  /** Absolute UTC season end (04 §12); rendered via CozyCountdown. */
  endsAt: string | null;
  objectives: SeasonObjectiveView[];
  tiers: SeasonTierView[];
  bank: SeasonBankView;
  perks: SeasonPerkView[];
  progress: SeasonProgressView;
  /** The server clock for this read. */
  now: string;
}

function rewardOf(raw: unknown): SeasonRewardView {
  const r = record(raw);
  const perks = counts(r.perks ?? r.Perks);
  const view: SeasonRewardView = {
    cash: num(r.cash, 0),
    fans: int(r.fans, 0),
    scoutTokens: int(r.scoutTokens, 0),
    sponsorCredits: int(r.sponsorCredits, 0),
    perks,
    isEmpty: false,
  };
  view.isEmpty =
    view.cash === 0 &&
    view.fans === 0 &&
    view.scoutTokens === 0 &&
    view.sponsorCredits === 0 &&
    perks.length === 0;
  return view;
}

function objectiveOf(raw: unknown): SeasonObjectiveView | null {
  if (!isRecord(raw)) return null;
  const goal = Math.max(1, int(raw.goal, 1));
  const progress = Math.max(0, int(raw.progress, 0));
  const code = str(raw.code, str(raw.id));
  return {
    id: str(raw.id, code),
    code,
    title: str(raw.title, code),
    points: int(raw.points, 0),
    goal,
    progress,
    complete: bool(raw.complete, progress >= goal),
    claimed: bool(raw.claimed),
    scope: str(raw.scope, 'individual'),
    fill: Math.min(1, progress / goal),
  };
}

function tierOf(raw: unknown): SeasonTierView | null {
  if (!isRecord(raw)) return null;
  return {
    tier: int(raw.tier, 0),
    points: int(raw.points, 0),
    silver: rewardOf(raw.silver),
    gold: rewardOf(raw.gold),
    silverClaimed: bool(raw.silverClaimed),
    goldClaimed: bool(raw.goldClaimed),
    silverClaimable: bool(raw.silverClaimable),
    goldClaimable: bool(raw.goldClaimable),
  };
}

/** Progress between the tier thresholds that bracket `points`. */
export function seasonProgress(
  points: number,
  tiers: readonly SeasonTierView[]
): SeasonProgressView {
  const sorted = [...tiers].sort((a, b) => a.points - b.points);
  const next = sorted.find((t) => t.points > points) ?? null;
  const lower = [...sorted].reverse().find((t) => t.points <= points);
  const floor = lower?.points ?? 0;
  const ceiling = next?.points ?? floor;
  const span = ceiling - floor;
  return {
    current: points,
    next: next?.points ?? null,
    pct: span > 0 ? Math.min(1, Math.max(0, (points - floor) / span)) : 1,
  };
}

/** Coerce a `season.get` payload into a view model, or null when malformed. */
export function coerceSeason(raw: unknown): SeasonView | null {
  if (!isRecord(raw)) return null;
  const clubId = str(raw.clubId);
  if (!clubId) return null;
  const tiers = list(raw.tiers)
    .map(tierOf)
    .filter((t): t is SeasonTierView => t !== null)
    .sort((a, b) => a.tier - b.tier);
  const points = int(raw.points, 0);
  const bank = record(raw.bank);
  return {
    clubId,
    name: str(raw.name, 'Club'),
    seasonKey: str(raw.seasonKey),
    points,
    tier: int(raw.tier, 0),
    maxTier: int(raw.maxTier, tiers.length),
    nextThreshold: int(raw.nextThreshold, 0),
    hasPass: bool(raw.hasPass),
    silverClaimedTier: int(raw.silverClaimedTier, 0),
    goldClaimedTier: int(raw.goldClaimedTier, 0),
    endsAt: nullableStr(raw.endsAt),
    objectives: list(raw.objectives)
      .map(objectiveOf)
      .filter((o): o is SeasonObjectiveView => o !== null),
    tiers,
    bank: {
      accrued: num(bank.accrued, 0),
      claimed: num(bank.claimed, 0),
      claimable: num(bank.claimable, 0),
      open: bool(bank.open),
      endsAt: nullableStr(bank.endsAt),
    },
    perks: list(raw.perks)
      .filter(isRecord)
      .map((p) => ({
        key: str(p.perk, str(p.key)),
        name: str(p.name, str(p.perk)),
        category: str(p.category, 'resource'),
        count: int(p.count, 0),
      }))
      .filter((p) => p.key !== ''),
    progress: seasonProgress(points, tiers),
    now: str(raw.now),
  };
}

/** A perk with a redemption count, ready for `campus.usePerk`. */
export function ownedPerks(season: SeasonView): SeasonPerkView[] {
  return season.perks.filter((p) => p.count > 0);
}

/** The next claimable Silver or Gold tier for a track, or null. */
export function nextClaimableTier(
  season: SeasonView,
  track: 'silver' | 'gold'
): SeasonTierView | null {
  return (
    season.tiers.find((t) =>
      track === 'silver' ? t.silverClaimable : t.goldClaimable
    ) ?? null
  );
}
