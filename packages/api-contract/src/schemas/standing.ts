// Standing Points, Standing Leagues and the weekly ladder (docs/coc-mapping/04
// §4, 02 §H). Standing Points are the async ladder rating, kept separate from the
// structured-competition Elo. The multipliers mirror internal/league (stored
// x100).
import { z } from 'zod';

export const StandingLeagueSchema = z.object({
  code: z.string(),
  name: z.string(),
  division: z.number().int().min(0).max(3),
  lowerBound: z.number().int().min(0),
  multiplierX100: z.number().int().min(100),
});

export const StandingSchema = z.object({
  clubId: z.string(),
  points: z.number().int(),
  leagueCode: z.string(),
  division: z.number().int().min(0).max(3),
  multiplierX100: z.number().int().min(100),
  rank: z.number().int().nullable(),
});

export const StandingPoolSchema = z.object({
  weekKey: z.string(),
  leagueCode: z.string(),
  pool: z.number().int(),
  attacks: z.number().int().min(0),
  attacksAllowed: z.number().int().min(0),
  defenses: z.number().int().min(0),
  stars: z.number().int().min(0),
  placement: z.number().int().nullable(),
});

export const FormBonusSchema = z.object({
  stars: z.number().int().min(0),
  required: z.number().int().min(1),
  ready: z.boolean(),
  nextResetAt: z.string().nullable(),
});

export type StandingLeague = z.infer<typeof StandingLeagueSchema>;
export type Standing = z.infer<typeof StandingSchema>;
export type StandingPool = z.infer<typeof StandingPoolSchema>;
export type FormBonus = z.infer<typeof FormBonusSchema>;
