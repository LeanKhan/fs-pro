import { and, desc, eq, lt } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubChallenges, clubs } from '../../db/drizzle/schema';
import { levelForXp, payClub } from './rewards';
import { describeHours, scaled } from './game-time';

/**
 * Club challenges: timed goals ("win N matches within T hours"). One active
 * challenge per club. Expiry is resolved lazily whenever the challenge is
 * read or a match is recorded (real time, so it works with nobody online),
 * and a new one is issued as soon as the previous one resolves - failing has
 * no penalty beyond losing the reward.
 */

const db = () => DrizzleDatabase.getInstance().database;

/** Design length of a challenge; the real window is scaled by GAME_TIME_SCALE. */
const CHALLENGE_HOURS = 24;

export interface ChallengeState {
  id: string;
  title: string;
  targetWins: number;
  wins: number;
  matchesPlayed: number;
  status: string;
  expiresAt: string;
  secondsLeft: number;
  rewardCash: number;
  rewardXP: number;
}

const toState = (row: typeof clubChallenges.$inferSelect): ChallengeState => ({
  id: row.id,
  title: row.Title,
  targetWins: row.TargetWins,
  wins: row.Wins,
  matchesPlayed: row.MatchesPlayed,
  status: row.Status,
  expiresAt: row.ExpiresAt.toISOString(),
  secondsLeft: Math.max(Math.ceil((row.ExpiresAt.getTime() - Date.now()) / 1000), 0),
  rewardCash: row.RewardCash,
  rewardXP: row.RewardXP,
});

/** Marks past-deadline unfinished challenges as failed. */
async function failExpired(clubId: string) {
  const now = new Date();
  await db()
    .update(clubChallenges)
    .set({ Status: 'failed', ResolvedAt: now, updatedAt: now })
    .where(
      and(
        eq(clubChallenges.ClubId, clubId),
        eq(clubChallenges.Status, 'active'),
        lt(clubChallenges.ExpiresAt, now)
      )
    );
}

async function findActive(clubId: string) {
  const [row] = await db()
    .select()
    .from(clubChallenges)
    .where(and(eq(clubChallenges.ClubId, clubId), eq(clubChallenges.Status, 'active')))
    .orderBy(desc(clubChallenges.createdAt))
    .limit(1);
  return row;
}

/** The club's active challenge, issuing a new one if there is none. */
export async function ensureChallenge(clubId: string): Promise<ChallengeState> {
  await failExpired(clubId);

  const active = await findActive(clubId);
  if (active) return toState(active);

  const [club] = await db().select({ xp: clubs.XP }).from(clubs).where(eq(clubs.id, clubId));
  const level = levelForXp(club?.xp ?? 0);
  const targetWins = 3 + Math.floor(level / 3);
  const [created] = await db()
    .insert(clubChallenges)
    .values({
      ClubId: clubId,
      Type: 'win_matches',
      Title: `Win ${targetWins} matches within ${describeHours(scaled(CHALLENGE_HOURS))}`,
      TargetWins: targetWins,
      ExpiresAt: new Date(Date.now() + scaled(CHALLENGE_HOURS) * 3_600_000),
      RewardCash: Math.round(40_000 * (1 + level * 0.5)),
      RewardXP: 60 + level * 20,
      updatedAt: new Date(),
    })
    .returning();
  return toState(created);
}

/**
 * Records a finished match against the club's active challenge. On the win
 * that reaches the target the reward is paid and the challenge completes.
 */
export async function recordMatchForChallenge(
  clubId: string,
  won: boolean
): Promise<{ challenge: ChallengeState; completed: boolean }> {
  await ensureChallenge(clubId);
  const row = await findActive(clubId);

  const wins = row.Wins + (won ? 1 : 0);
  const completed = wins >= row.TargetWins;
  const now = new Date();
  const [updated] = await db()
    .update(clubChallenges)
    .set({
      Wins: wins,
      MatchesPlayed: row.MatchesPlayed + 1,
      ...(completed ? { Status: 'completed', ResolvedAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(clubChallenges.id, row.id))
    .returning();

  if (completed) {
    await payClub(
      clubId,
      { cash: row.RewardCash, xp: row.RewardXP },
      'challenge_reward',
      `Challenge: ${row.Title}`
    );
  }
  return { challenge: toState(updated), completed };
}
