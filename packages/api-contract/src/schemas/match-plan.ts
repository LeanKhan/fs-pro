import { z } from 'zod';

/**
 * Match prep (docs/CORE-LOOP.md, "Match day"): the plan a manager sets for
 * one fixture in the days before kick-off. Every field reaches the engine
 * (crates/sim-core): the tactic and its sliders, the XI, the half-time
 * orders, and the training session and team talk as small, bounded
 * per-match nudges.
 */

/** Playing styles, in the engine's naming (tactics.rs match_style_defaults).
 * High Press > Possession > Low Block > Direct > High Press; Balanced is
 * neutral against all of them (tactics.rs style_matchup). */
export const STYLE_KEYS = ['Balanced', 'HighPress', 'Possession', 'LowBlock', 'Direct'] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

export const PLAN_FORMATIONS = ['433', '442', '4231', '352', '343', '532', '541', '4141', '451', '41212'] as const;

const unit = z.number().min(0).max(1);

export const HalfTimeOrdersSchema = z.object({
  losing: z.enum(STYLE_KEYS).nullable(),
  drawing: z.enum(STYLE_KEYS).nullable(),
  winning: z.enum(STYLE_KEYS).nullable(),
});

/** The pre-match training session: `recovery` freshens the starters,
 * `drills` sharpens them (scaled by the Training Ground) but tires them. */
export const TRAINING_KEYS = ['none', 'recovery', 'drills'] as const;
/** Team talk: `calm` changes nothing; `motivate` lifts an underdog;
 * `demand` lifts a confident favourite and backfires otherwise. */
export const TEAM_TALK_KEYS = ['calm', 'motivate', 'demand'] as const;

export const MatchPlanSchema = z.object({
  formation: z.enum(PLAN_FORMATIONS),
  style: z.enum(STYLE_KEYS),
  /** Slider overrides on top of the style (0-1); null keeps the style's own. */
  sliders: z
    .object({
      pressing: unit.nullable(),
      line: unit.nullable(),
      width: unit.nullable(),
      tempo: unit.nullable(),
      directness: unit.nullable(),
    })
    .partial()
    .optional(),
  /** Player ids in the team sheet's slot order; empty = the club's saved sheet. */
  startingXI: z.array(z.string()).max(11),
  bench: z.array(z.string()).max(9),
  halfTime: HalfTimeOrdersSchema,
  training: z.enum(TRAINING_KEYS),
  teamTalk: z.enum(TEAM_TALK_KEYS),
});

export const MatchdayKindSchema = z.enum(['league', 'booked', 'challenge', 'cup', 'friendly']);

/** One of the club's scheduled matches, as the Matchday list shows it. */
export const MatchdayFixtureSchema = z.object({
  fixtureId: z.string(),
  kind: MatchdayKindSchema,
  title: z.string(),
  home: z.boolean(),
  opponent: z.object({ id: z.string(), name: z.string(), code: z.string(), power: z.number(), human: z.boolean() }),
  day: z.number().nullable(),
  kickoffHour: z.number().nullable(),
  /** Real seconds to kick-off; null while the world clock is paused. */
  startsInSeconds: z.number().nullable(),
  played: z.boolean(),
  playedAt: z.string().nullable(),
  score: z.object({ you: z.number(), them: z.number() }).nullable(),
  /** The manager saved a plan for this match (otherwise the club's defaults play). */
  planSet: z.boolean(),
  hasReplay: z.boolean(),
});

export const MatchdaySchema = z.object({
  upcoming: z.array(MatchdayFixtureSchema),
  recent: z.array(MatchdayFixtureSchema),
  /** How many booked matches the club may have waiting at once, and has. */
  bookings: z.object({ used: z.number(), max: z.number() }),
});

export const PrepPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.string(),
  rating: z.number(),
  fitness: z.number(),
  morale: z.number(),
  injured: z.boolean(),
});

/** What the club's scouts know about the opponent; deeper with a better
 * Scouting Department. */
export const ScoutReportSchema = z.object({
  level: z.number(),
  power: z.number(),
  formation: z.string().nullable(),
  style: z.enum(STYLE_KEYS).nullable(),
  /** The style that counters theirs, once their style is known. */
  counter: z.enum(STYLE_KEYS).nullable(),
  keyPlayers: z.array(z.object({ name: z.string(), position: z.string(), rating: z.number() })),
  form: z.array(z.enum(['W', 'D', 'L'])),
  notes: z.array(z.string()),
});

export const MatchPrepSchema = z.object({
  fixture: MatchdayFixtureSchema,
  plan: MatchPlanSchema,
  /** True once kick-off has passed: the plan can no longer change. */
  locked: z.boolean(),
  squad: z.array(PrepPlayerSchema),
  scout: ScoutReportSchema,
  facilities: z.object({ trainingTier: z.number(), scoutingTier: z.number(), medicalTier: z.number() }),
  myPower: z.number(),
});

export const PlanFactorSchema = z.object({
  label: z.string(),
  tone: z.enum(['good', 'bad', 'neutral']),
  detail: z.string(),
});

/** The assistant's read: the real engine played this plan `runs` times. */
export const PlanPreviewSchema = z.object({
  runs: z.number(),
  win: z.number(),
  draw: z.number(),
  loss: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  factors: z.array(PlanFactorSchema),
});

export type MatchPlan = z.infer<typeof MatchPlanSchema>;
export type HalfTimeOrders = z.infer<typeof HalfTimeOrdersSchema>;
export type MatchdayFixture = z.infer<typeof MatchdayFixtureSchema>;
export type Matchday = z.infer<typeof MatchdaySchema>;
export type MatchPrep = z.infer<typeof MatchPrepSchema>;
export type PrepPlayer = z.infer<typeof PrepPlayerSchema>;
export type ScoutReport = z.infer<typeof ScoutReportSchema>;
export type PlanPreview = z.infer<typeof PlanPreviewSchema>;
export type PlanFactor = z.infer<typeof PlanFactorSchema>;
