/**
 * The ladder screen's pure core (docs/coc-mapping/04 §4-§5, 08 §2 P6, OW-N10).
 *
 * Standing Leagues are the async ladder: Standing Points + the league rung
 * (Bronze…Legend, x100 multiplier), a global rank, the weekly tournament pool
 * (attacks/defenses used against the allowance) and the rolling 24h Form Bonus.
 * The last Board Vault claim (`play.claimBoardVault`) banks the Form Bonus loot.
 *
 * The ladder rung code is the server's stable code (`gold_3`, `legend`,
 * `unranked`); this module turns it into the player-facing label ("Gold III").
 * Every timer the screen renders is an absolute UTC timestamp (04 §12).
 *
 * Pure: no Vue, no network, no clock. Unit-tested in `league-ladder.test.ts`.
 */
import type { FormBonus, Standing, StandingPool } from '@repo/api-contract';

const ROMAN = ['', 'I', 'II', 'III'];

/** "gold_3" → "Gold III"; "legend" → "Legend"; "unranked" → "Unranked". */
export function leagueLabel(code: string): string {
  const [name, division] = code.split('_');
  if (!name) return 'Unranked';
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  const n = Number(division);
  return Number.isFinite(n) && n >= 1 && n <= 3 ? `${title} ${ROMAN[n]}` : title;
}

/** A x100 multiplier as a label: `130` → `x1.30`. */
export function multiplierLabel(multiplierX100: number): string {
  return `x${(multiplierX100 / 100).toFixed(2)}`;
}

/** The club's Standing as the ladder header shows it. */
export interface StandingView {
  points: number;
  rank: number | null;
  leagueCode: string;
  division: number;
  leagueLabel: string;
  multiplier: number;
  multiplierLabel: string;
}

/** Build the Standing view model. */
export function standingView(s: Standing): StandingView {
  return {
    points: s.points,
    rank: s.rank,
    leagueCode: s.leagueCode,
    division: s.division,
    leagueLabel: leagueLabel(s.leagueCode),
    multiplier: s.multiplierX100 / 100,
    multiplierLabel: multiplierLabel(s.multiplierX100),
  };
}

/** The weekly tournament pool as the ladder shows it. */
export interface PoolView {
  weekKey: string;
  pool: number;
  attacksUsed: number;
  attacksAllowed: number;
  attacksLeft: number;
  defenses: number;
  stars: number;
  placement: number | null;
}

/** Build the weekly-pool view model (attacks-left is never negative). */
export function poolView(p: StandingPool): PoolView {
  return {
    weekKey: p.weekKey,
    pool: p.pool,
    attacksUsed: p.attacks,
    attacksAllowed: p.attacksAllowed,
    attacksLeft: Math.max(0, p.attacksAllowed - p.attacks),
    defenses: p.defenses,
    stars: p.stars,
    placement: p.placement,
  };
}

/** The rolling Form Bonus window as the ladder shows it. */
export interface FormBonusView {
  stars: number;
  required: number;
  ready: boolean;
  /** stars/required, clamped 0..1. */
  fill: number;
  /** "3 / 5". */
  label: string;
  /** Absolute UTC reset instant, or null when the window is empty. */
  nextResetAt: string | null;
}

/** Build the Form Bonus view model. */
export function formBonusView(f: FormBonus): FormBonusView {
  const required = f.required > 0 ? f.required : 1;
  const stars = Math.max(0, f.stars);
  return {
    stars,
    required: f.required,
    ready: f.ready,
    fill: Math.min(1, stars / required),
    label: `${stars} / ${f.required}`,
    nextResetAt: f.nextResetAt,
  };
}

/** The Board Vault claim UI (04 §5.2): the button only shows when claimable. */
export interface VaultClaimGate {
  claimable: boolean;
  /** Why the claim is hidden, or null when it is available. */
  reason: string | null;
}

/** Whether `play.claimBoardVault` should be offered. */
export function vaultClaimGate(
  balance: number,
  ready: boolean
): VaultClaimGate {
  if (balance > 0) return { claimable: true, reason: null };
  if (ready)
    return { claimable: true, reason: null };
  return { claimable: false, reason: 'The Board Vault is empty.' };
}
