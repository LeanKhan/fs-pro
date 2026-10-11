// The scout screen report (docs/coc-mapping/03 §1.7, 02 §B2): an opponent's
// Home Grid plus a coarse, deterministic threat read, masked by the caller's
// Scouting facility. The Go builder is play.ScoutOpponent (internal/play).
import { z } from 'zod';
import { PitchGridDocumentSchema } from './layout';

export const ScoutLaneSchema = z.object({
  name: z.string(),
  players: z.number().int().min(0),
  share: z.number(),
});

/** A coarse read of a shape: loaded lanes, per-column occupancy, intent. */
export const ThreatReadSchema = z.object({
  lanes: z.array(ScoutLaneSchema),
  occupancy: z.array(z.number().int().min(0)),
  attacking: z.number().int().min(0),
  highLine: z.boolean(),
});

export const ScoutOpponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  power: z.number(),
});

export const ScoutOpponentReportSchema = z.object({
  opponent: ScoutOpponentSchema,
  tier: z.number(),
  league: z.string(),
  scoutingLevel: z.number(),
  rating: z.object({ low: z.number(), high: z.number() }),
  homeGrid: PitchGridDocumentSchema.nullable(),
  threat: ThreatReadSchema.nullable(),
  notes: z.array(z.string()),
});

export type ThreatRead = z.infer<typeof ThreatReadSchema>;
export type ScoutOpponentReport = z.infer<typeof ScoutOpponentReportSchema>;
