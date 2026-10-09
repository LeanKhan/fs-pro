import type { MatchPlan, StyleKey } from '@repo/api-contract';
import { STYLE_KEYS } from '@repo/api-contract';

/**
 * What a match plan does to the engine request (docs/CORE-LOOP.md, "Match
 * day"), shared by real matches (buildSimulateMatchRequest) and the win
 * chance preview, so the preview can never promise something the match
 * doesn't do. Pure: no DB, no imports from the match pipeline.
 *
 * Skill nudges are added to every attribute: the engine reads attributes
 * and only falls back on Rating when a player has none, so a Rating-only
 * nudge does nothing (it never did for real squads).
 */

/** The tactic JSON the engine reads (crates/sim-core contract.rs RawTactic),
 * plus the whole plan so it can be read back. */
export interface PlanTactic {
  formationName: string;
  styleName: string;
  pressingIntensity?: number;
  defensiveLineHeight?: number;
  width?: number;
  tempo?: number;
  directness?: number;
  halfTime?: MatchPlan['halfTime'];
  plan?: MatchPlan;
}

export const NO_HALF_TIME: MatchPlan['halfTime'] = { losing: null, drawing: null, winning: null };

/** 'High Press', 'high_press', 'HighPress' -> 'HighPress'; anything else Balanced. */
export function styleKey(name: unknown): StyleKey {
  const clean = String(name ?? '').replace(/[\s_-]/g, '').toLowerCase();
  return STYLE_KEYS.find((k) => k.toLowerCase() === clean) ?? 'Balanced';
}

/** The engine's counter cycle (tactics.rs style_matchup), for the UI. */
const CYCLE: StyleKey[] = ['HighPress', 'Possession', 'LowBlock', 'Direct'];
export function styleMatchup(own: StyleKey, opp: StyleKey): 1 | 0 | -1 {
  const a = CYCLE.indexOf(own);
  const b = CYCLE.indexOf(opp);
  if (a < 0 || b < 0) return 0;
  if ((a + 1) % 4 === b) return 1;
  if ((b + 1) % 4 === a) return -1;
  return 0;
}
/** The style that beats `style`, or null for Balanced. */
export function counterTo(style: StyleKey): StyleKey | null {
  const b = CYCLE.indexOf(style);
  return b < 0 ? null : CYCLE[(b + 3) % 4];
}

export function planTactic(plan: MatchPlan): PlanTactic {
  const s = plan.sliders ?? {};
  return {
    formationName: plan.formation,
    styleName: plan.style,
    ...(s.pressing != null ? { pressingIntensity: s.pressing } : {}),
    ...(s.line != null ? { defensiveLineHeight: s.line } : {}),
    ...(s.width != null ? { width: s.width } : {}),
    ...(s.tempo != null ? { tempo: s.tempo } : {}),
    ...(s.directness != null ? { directness: s.directness } : {}),
    halfTime: plan.halfTime,
    plan,
  };
}

/** Tuning (skill points; attributes are ~40-90, see config.rs scales). */
export const PLAN_TUNING = {
  recoveryFitness: 20,
  drillsFitnessCost: 10,
  drillsBase: 0.6,
  drillsPerTrainingTier: 0.35,
  motivateUnderdog: 1.0,
  motivateFavourite: 0.2,
  demandConfident: 1.2,
  demandBackfire: -1.0,
  /** "Underdog" = the opponent's power is at least this much higher. */
  underdogGap: 5,
  /** Morale needed for `demand` to land. */
  demandMorale: 58,
};

export interface PlanContext {
  myPower: number;
  oppPower: number;
  /** Average squad morale, 0-100 (60 neutral). */
  morale: number;
  trainingTier: number;
}

export interface PlanEffect {
  /** Skill points added to every attribute of the side's players. */
  skill: number;
  /** Fitness change for the starters (clamped 0-100 when applied). */
  starterFitness: number;
  /** Readable reasons, for the preview. */
  notes: { label: string; tone: 'good' | 'bad' | 'neutral'; detail: string }[];
}

export function planEffect(plan: MatchPlan, ctx: PlanContext): PlanEffect {
  const t = PLAN_TUNING;
  let skill = 0;
  let starterFitness = 0;
  const notes: PlanEffect['notes'] = [];

  if (plan.training === 'recovery') {
    starterFitness += t.recoveryFitness;
    notes.push({ label: 'Recovery session', tone: 'good', detail: `Starters +${t.recoveryFitness} fitness` });
  } else if (plan.training === 'drills') {
    const sharp = t.drillsBase + t.drillsPerTrainingTier * ctx.trainingTier;
    skill += sharp;
    starterFitness -= t.drillsFitnessCost;
    notes.push({
      label: 'Tactical drills',
      tone: 'good',
      detail: `+${sharp.toFixed(1)} sharpness (Training Ground tier ${ctx.trainingTier}), starters -${t.drillsFitnessCost} fitness`,
    });
  }

  const underdog = ctx.oppPower - ctx.myPower >= t.underdogGap;
  if (plan.teamTalk === 'motivate') {
    const v = underdog ? t.motivateUnderdog : t.motivateFavourite;
    skill += v;
    notes.push({ label: 'Team talk: motivate', tone: 'good', detail: underdog ? 'Fired up as underdogs' : 'A small lift' });
  } else if (plan.teamTalk === 'demand') {
    const lands = !underdog && ctx.morale >= t.demandMorale;
    skill += lands ? t.demandConfident : t.demandBackfire;
    notes.push({
      label: 'Team talk: demand a win',
      tone: lands ? 'good' : 'bad',
      detail: lands ? 'A confident squad rises to it' : underdog ? 'Too much pressure against a stronger side' : 'Morale too low: it backfires',
    });
  }
  return { skill, starterFitness, notes };
}

type PlainPlayer = { _id?: unknown; id?: unknown; Rating?: number; Fitness?: number; Attributes?: Record<string, unknown> | null };
type PlainClub = { _id?: unknown; Rating?: number; Players?: PlainPlayer[]; Lineup?: { startingXI?: string[]; bench?: string[] } | null };

/** Shift a club's skills by `points` for this match only (never persisted). */
export function nudgeSkills(club: PlainClub, points: number) {
  if (!points) return;
  club.Rating = (club.Rating ?? 0) + points;
  for (const p of club.Players ?? []) {
    p.Rating = (p.Rating ?? 0) + points;
    const attrs = p.Attributes;
    if (!attrs) continue;
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (typeof v === 'number') attrs[k] = Math.max(1, Math.min(99, v + points));
    }
  }
}

/** Apply a plan's lineup and starter fitness to a plain club. */
export function applyPlanToClub(club: PlainClub, plan: MatchPlan | undefined, effect: PlanEffect | null) {
  if (plan && plan.startingXI.length) club.Lineup = { startingXI: plan.startingXI, bench: plan.bench };
  if (!effect?.starterFitness) return;
  const starters = new Set(club.Lineup?.startingXI ?? []);
  for (const p of club.Players ?? []) {
    const id = String(p._id ?? p.id ?? '');
    if (!starters.has(id)) continue;
    p.Fitness = Math.max(0, Math.min(100, (p.Fitness ?? 100) + effect.starterFitness));
  }
}

/** Parse a fixture's stored side tactic (a JSON text column). */
export function parseSideTactic(raw: unknown): PlanTactic | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object') return raw as PlanTactic;
  try {
    return JSON.parse(String(raw)) as PlanTactic;
  } catch {
    return undefined;
  }
}
