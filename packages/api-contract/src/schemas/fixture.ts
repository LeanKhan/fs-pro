import { z } from 'zod';
import { ClubSchema } from './club';

// Verified against a real GET /fixtures response (not just fixture.model.ts's
// TS interface, which has drifted from what Postgres actually returns):
// the field is `FixtureCode` (not `FixtureID`), `Details.Winner`/`Loser` are
// plain club-id strings (not `{code,id}`), `Status`/`Title` inside `Details`
// and top-level `Status` are never actually populated, and the embedded
// `Details.HomeTeamDetails`/`AwayTeamDetails` summary uses `Club` + a
// string-id `PlayerStats` array while the top-level `HomeSideDetails`/
// `AwaySideDetails` relational record uses `ClubId` + full PlayerStats
// objects - two genuinely different shapes despite the similar name.
//
// `MOTM`, `HomeTactic`/`AwayTactic` reference domain shapes (Player,
// tactics) that don't have their own contract yet - left as unknown() until
// those entities get converted, same treatment as ClubSchema's own
// stub-to-full progression.
export const MatchEventSchema = z.object({
  type: z.enum([
    'match',
    'shot',
    'miss',
    'save',
    'goal',
    'dribble',
    'tackle',
    'pass',
    'interception',
    'foul',
    'substitution',
  ]),
  message: z.string(),
  time: z.string().optional(),
  playerID: z.string().nullable().optional(),
  playerTeamID: z.string().nullable().optional(),
  data: z.unknown().optional(),
});

export const PlayerMatchStatSchema = z
  .object({
    _id: z.string(),
    PlayerId: z.string().nullable(),
    FixtureId: z.string(),
    ClubMatchDetailsId: z.string(),
    Goals: z.number(),
    Saves: z.number(),
    YellowCards: z.number(),
    Fouls: z.number(),
    RedCards: z.number(),
    Passes: z.number(),
    Tackles: z.number(),
    Assists: z.number(),
    CleanSheets: z.number(),
    Points: z.number(),
    Dribbles: z.number(),
    Interceptions: z.number(),
    Form: z.number(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

/** Denormalized per-team summary embedded in Details.{Home,Away}TeamDetails
 * - NOT the same shape as the relational HomeSideDetails/AwaySideDetails
 * record (see MatchSideDetailsSchema). PlayerStats here is just ids. */
export const MatchTeamSummarySchema = z
  .object({
    Won: z.boolean(),
    Club: z.string().optional(),
    Fouls: z.number(),
    Goals: z.number(),
    Passes: z.number(),
    RedCards: z.number(),
    Possession: z.number(),
    TotalShots: z.number(),
    PlayerStats: z.array(z.string()),
    YellowCards: z.number(),
    ShotsOnTarget: z.number(),
    TimesWithBall: z.number(),
    ShotsOffTarget: z.number(),
  })
  .passthrough();

export const MatchDetailsSchema = z
  .object({
    Draw: z.boolean(),
    MOTM: z.unknown().nullable(),
    Goals: z.number(),
    Loser: z.string().nullable(),
    Played: z.boolean(),
    Winner: z.string().nullable(),
    TotalPasses: z.number(),
    AwayTeamScore: z.number(),
    FullTimeScore: z.string(),
    HomeTeamScore: z.number(),
    HomeTeamDetails: MatchTeamSummarySchema,
    AwayTeamDetails: MatchTeamSummarySchema,
  })
  .passthrough();

/** The full relational side-details record (top-level HomeSideDetails/
 * AwaySideDetails) - distinct from MatchTeamSummarySchema above. */
export const MatchSideDetailsSchema = z
  .object({
    _id: z.string(),
    ClubId: z.string(),
    FixtureId: z.string(),
    Possession: z.number(),
    Goals: z.number(),
    ShotsOnTarget: z.number(),
    ShotsOffTarget: z.number(),
    Fouls: z.number(),
    YellowCards: z.number(),
    RedCards: z.number(),
    Passes: z.number(),
    Won: z.boolean(),
    Drew: z.boolean(),
    Events: z.array(MatchEventSchema),
    PlayerStats: z.array(PlayerMatchStatSchema),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const FixtureSchema = z.object({
  _id: z.string().optional(),
  Title: z.string(),
  FixtureCode: z.string(),
  SeasonCode: z.string(),
  LeagueCode: z.string(),
  Week: z.number(),
  SeasonId: z.string(),
  Stadium: z.string(),
  Played: z.boolean(),
  Tie: z.string().nullable().optional(),
  Stage: z.string().nullable().optional(),
  ReverseFixtureId: z.string().nullable().optional(),
  PlayedAt: z.string().nullable().optional(),
  Home: z.string(),
  Away: z.string(),
  HomeTeamId: z.string(),
  HomeTeam: ClubSchema.optional(),
  AwayTeamId: z.string(),
  AwayTeam: ClubSchema.optional(),
  // null until the fixture is actually played - populated by the match
  // engine, not present at fixture-creation time.
  Details: MatchDetailsSchema.nullable(),
  Events: z.array(MatchEventSchema),
  Type: z.enum(['league', 'cup', 'tournament', 'friendly']),
  // Declared in fixture.model.ts but never observed populated on real data -
  // kept optional rather than dropped, in case some write path still sets it.
  Status: z
    .enum(['friendly', 'first-leg', 'second-leg', 'regular'])
    .optional(),
  HomeSideDetailsId: z.string().nullable().optional(),
  HomeSideDetails: MatchSideDetailsSchema.optional(),
  AwaySideDetailsId: z.string().nullable().optional(),
  AwaySideDetails: MatchSideDetailsSchema.optional(),
  HomeManagerId: z.string().nullable().optional(),
  AwayManagerId: z.string().nullable().optional(),
  HomeTactic: z.unknown().nullable().optional(),
  AwayTactic: z.unknown().nullable().optional(),
  SaveStats: z.boolean().nullable().optional(),
  isFinalMatch: z.boolean().optional(),
  ScheduledDay: z.number().nullable().optional(),
  ScheduledDate: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Fixture = z.infer<typeof FixtureSchema>;
