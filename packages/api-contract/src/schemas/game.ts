import { z } from 'zod';
import { FixtureSchema, MatchTeamSummarySchema } from './fixture';
import { ClubStandingsSchema } from './season';

/** A picked formation+playing-style pair, matching `ITactic` in
 * `state/PersistentState/Formations.ts` server-side. */
export const TacticSchema = z.object({
  formationName: z.string(),
  styleName: z.string(),
});

/** What `play()` resolves with per fixture actually played. `homeTable`/
 * `awayTable`/`lastMatchOfSeason` are absent for a friendly (season-less,
 * no standings to update). `HomeSideDetails`/`AwaySideDetails` here are the
 * embedded Details.{Home,Away}TeamDetails *summary* shape (Club + string-id
 * PlayerStats), NOT the relational MatchSideDetails record already nested
 * inside `match` - same naming collision documented on FixtureSchema. */
export const PlayResultSchema = z.object({
  homeTable: ClubStandingsSchema.optional(),
  awayTable: ClubStandingsSchema.optional(),
  match: FixtureSchema.optional(),
  HomeSideDetails: MatchTeamSummarySchema.optional(),
  AwaySideDetails: MatchTeamSummarySchema.optional(),
  lastMatchOfSeason: z.boolean().optional(),
});

export const GameResultsSchema = z.object({
  main: PlayResultSchema.optional(),
  others: z.array(PlayResultSchema),
});

export type Tactic = z.infer<typeof TacticSchema>;
export type PlayResult = z.infer<typeof PlayResultSchema>;
export type GameResults = z.infer<typeof GameResultsSchema>;
