import { eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { ownerProgram } from '../../db/drizzle/schema';

/**
 * Qualifying-friendly XP (phase-2 L6). Level 0 -> 1 must be earned: the owner
 * program pays 3/9/18 per step and the rest of the 100 XP (`services/world/
 * level.ts`) must come from winning **qualifying** friendlies - a `PLAY` match
 * played while the club was still in the program (before it reached Level 1
 * and was placed in a league). This module is the one definition of
 * "qualifying", shared by the program facts builder and the tests.
 *
 * The XP values themselves are the match rewards (`services/play/
 * play.service.ts` REWARD_XP), so the two can't drift.
 */

/** XP per qualifying-friendly outcome (L6 / PROGRAM-SERVICE-CONTRACT §5.5). */
export const QUALIFYING_FRIENDLY_XP = { win: 30, draw: 10, loss: 5 } as const;

export interface FriendlyRecord {
  wins: number;
  draws: number;
  losses: number;
}

export type QualifyingBounds = { until: Date | null };

const db = () => DrizzleDatabase.getInstance().database;

/**
 * Count a club's qualifying friendlies. `Bounds.until` is the moment the
 * program completed (Level 1); a null bound means the club is still in the
 * program and every played friendly qualifies.
 */
export async function qualifyingFriendlyRecord(
  clubId: string,
  bounds?: QualifyingBounds
): Promise<FriendlyRecord> {
  const until = bounds ? bounds.until : await programCompletedAt(clubId);
  const timeClause = until ? sql`AND f."PlayedAt" <= ${until}` : sql``;
  const rows = await db().execute(sql`
    SELECT
      count(*) FILTER (WHERE
        (f."HomeTeamId" = ${clubId} AND (f."Details"->>'HomeTeamScore')::int > (f."Details"->>'AwayTeamScore')::int)
        OR (f."AwayTeamId" = ${clubId} AND (f."Details"->>'AwayTeamScore')::int > (f."Details"->>'HomeTeamScore')::int)
      )::int AS wins,
      count(*) FILTER (WHERE
        (f."Details"->>'HomeTeamScore')::int = (f."Details"->>'AwayTeamScore')::int
      )::int AS draws,
      count(*) FILTER (WHERE
        (f."HomeTeamId" = ${clubId} AND (f."Details"->>'HomeTeamScore')::int < (f."Details"->>'AwayTeamScore')::int)
        OR (f."AwayTeamId" = ${clubId} AND (f."Details"->>'AwayTeamScore')::int < (f."Details"->>'HomeTeamScore')::int)
      )::int AS losses
    FROM "Fixtures" f
    WHERE f."Type" = 'friendly' AND f."Played" = true
      AND (f."HomeTeamId" = ${clubId} OR f."AwayTeamId" = ${clubId})
      ${timeClause}
  `);
  const row = (rows as unknown as FriendlyRecord[])[0];
  return {
    wins: Number(row?.wins ?? 0),
    draws: Number(row?.draws ?? 0),
    losses: Number(row?.losses ?? 0),
  };
}

/** The program's completion timestamp, or null while the club is still Level 0. */
export async function programCompletedAt(clubId: string): Promise<Date | null> {
  const [program] = await db()
    .select({ completedAt: ownerProgram.CompletedAt })
    .from(ownerProgram)
    .where(eq(ownerProgram.ClubId, clubId))
    .limit(1);
  return program?.completedAt ?? null;
}
