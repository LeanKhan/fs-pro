import { z } from 'zod';

// The one perpetual timeline shared by the whole game world - a true
// singleton row, not one per real-world year.
export const CalendarSchema = z.object({
  _id: z.string().optional(),
  CurrentDay: z.number(),
  CurrentDate: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Sparse - a row only exists for a day that actually needs one (a real,
// non-match calendar event). Matches live on Fixture.ScheduledDay instead.
export const DaySchema = z
  .object({
    _id: z.string().optional(),
    Index: z.number(),
    Date: z.string(),
    Events: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

export const WorldFeedHeadlineSchema = z.object({
  id: z.string(),
  category: z.enum(['result', 'transfer', 'manager', 'injury', 'milestone']),
  title: z.string(),
  summary: z.string(),
  timestamp: z.string(),
  tag: z.string().optional(),
  relatedFixtureId: z.string().optional(),
});

export const WorldFeedRecentResultSchema = z.object({
  fixtureId: z.string(),
  title: z.string(),
  leagueCode: z.string(),
  home: z.string(),
  away: z.string(),
  homeScore: z.number(),
  awayScore: z.number(),
  motm: z.string().nullable().optional(),
  day: z.number().nullable().optional(),
  isUpset: z.boolean().optional(),
});

export const WorldFeedOtherLeagueSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  leader: z.string().optional(),
  leaderPoints: z.number().optional(),
  matchesPlayed: z.number().optional(),
});

export const WorldFeedInjurySchema = z.object({
  playerId: z.string(),
  name: z.string(),
  club: z.string(),
  type: z.string(),
  daysRemaining: z.number(),
});

export const WorldFeedSchema = z.object({
  currentDay: z.number(),
  currentDate: z.string(),
  recentResults: z.array(WorldFeedRecentResultSchema),
  headlines: z.array(WorldFeedHeadlineSchema),
  otherLeagues: z.array(WorldFeedOtherLeagueSchema),
  activeInjuries: z.array(WorldFeedInjurySchema),
});

export type Calendar = z.infer<typeof CalendarSchema>;
export type Day = z.infer<typeof DaySchema>;
export type WorldFeed = z.infer<typeof WorldFeedSchema>;
export type WorldFeedHeadline = z.infer<typeof WorldFeedHeadlineSchema>;

