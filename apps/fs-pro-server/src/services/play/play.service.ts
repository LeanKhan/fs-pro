import { and, desc, eq, inArray, isNull, like, ne } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, fixtures } from '../../db/drizzle/schema';
import { createFixture, getFixtureById } from '../../controllers/fixtures/fixture.service';
import { play } from '../../controllers/game/game.controller';
import { ensureChallenge, recordMatchForChallenge, type ChallengeState } from './challenge.service';
import { levelForXp, payClub, xpForLevel } from './rewards';

/**
 * PLAY: the match is the club's primary loop. Pressing PLAY matches the club
 * with an opponent of similar power (AI clubs for now), plays the match with
 * QuickSim and pays out rewards. Stadium gate income is credited to the home
 * club (always the player's) inside game/functions.ts's updateFixture.
 *
 * Stakes: a cooldown between matches, plus the squad fatigue/injuries every
 * match with SaveStats applies (players/player-fitness.service.ts).
 */

const db = () => DrizzleDatabase.getInstance().database;

/** Anti-grind: minimum gap between a club's matches. Gate income at higher
 * stadium levels is large, so this is the main brake - tune with the economy
 * (override with MATCH_COOLDOWN_SECONDS, e.g. 20 for local testing). */
export const MATCH_COOLDOWN_SECONDS = Number(process.env.MATCH_COOLDOWN_SECONDS) || 300;
/** Opponents are picked at random from this many closest-power AI clubs. */
const OPPONENT_POOL = 5;
const MATCH_TITLE_MARK = '(Matchmade)';

const REWARDS = {
  win: { cash: 25_000, xp: 30 },
  draw: { cash: 8_000, xp: 10 },
  loss: { cash: 2_000, xp: 5 },
} as const;

export type Outcome = 'win' | 'draw' | 'loss';

export interface ClubSummary {
  id: string;
  name: string;
  rating: number;
  power: number;
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  budget: number;
}

export interface RecentMatch {
  fixtureId: string;
  opponent: string;
  score: string;
  outcome: Outcome;
  playedAt: string;
}

export interface PlayState {
  club: ClubSummary;
  cooldownSeconds: number;
  challenge: ChallengeState;
  recent: RecentMatch[];
}

export interface MatchResult {
  fixtureId: string;
  opponent: { id: string; name: string; code: string; power: number };
  score: { you: number; them: number };
  outcome: Outcome;
  rewards: { cash: number; xp: number };
  gate: { attendance: number; revenue: number; costs: number; net: number } | null;
  challengeCompleted: boolean;
  state: PlayState;
}

const power = (rating: number | null | undefined) => Math.round((rating ?? 0) * 10) / 10;

function summarise(club: typeof clubs.$inferSelect): ClubSummary {
  const level = levelForXp(club.XP);
  return {
    id: club.id,
    name: club.Name,
    rating: club.Rating,
    power: power(club.Rating),
    xp: club.XP,
    level,
    xpIntoLevel: club.XP - xpForLevel(level),
    xpForNext: xpForLevel(level + 1) - xpForLevel(level),
    budget: club.Budget ?? 0,
  };
}

const scoresOf = (details: any) => ({
  home: Number(details?.HomeTeamScore ?? 0),
  away: Number(details?.AwayTeamScore ?? 0),
});

const outcomeFor = (yours: number, theirs: number): Outcome =>
  yours > theirs ? 'win' : yours < theirs ? 'loss' : 'draw';

const matchmadeBy = (clubId: string) =>
  and(
    eq(fixtures.HomeTeamId, clubId),
    eq(fixtures.Played, true),
    like(fixtures.Title, `%${MATCH_TITLE_MARK}`)
  );

async function cooldownSeconds(clubId: string): Promise<number> {
  const [last] = await db()
    .select({ playedAt: fixtures.PlayedAt })
    .from(fixtures)
    .where(matchmadeBy(clubId))
    .orderBy(desc(fixtures.PlayedAt))
    .limit(1);
  if (!last?.playedAt) return 0;
  const left = MATCH_COOLDOWN_SECONDS - (Date.now() - last.playedAt.getTime()) / 1000;
  return Math.max(Math.ceil(left), 0);
}

async function recentMatches(clubId: string): Promise<RecentMatch[]> {
  const rows = await db()
    .select()
    .from(fixtures)
    .where(matchmadeBy(clubId))
    .orderBy(desc(fixtures.PlayedAt))
    .limit(5);
  if (!rows.length) return [];

  const opponentIds = rows.map((r) => r.AwayTeamId).filter((id): id is string => !!id);
  const opponents = await db()
    .select({ id: clubs.id, name: clubs.Name })
    .from(clubs)
    .where(inArray(clubs.id, opponentIds));
  const nameOf = new Map(opponents.map((o) => [o.id, o.name]));

  return rows.map((r) => {
    const { home, away } = scoresOf(r.Details);
    return {
      fixtureId: r.id,
      opponent: nameOf.get(r.AwayTeamId ?? '') ?? 'Unknown',
      score: `${home} - ${away}`,
      outcome: outcomeFor(home, away),
      playedAt: (r.PlayedAt ?? r.updatedAt).toISOString(),
    };
  });
}

export async function getPlayState(clubId: string): Promise<PlayState> {
  const [club] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');
  const [challenge, cooldown, recent] = await Promise.all([
    ensureChallenge(clubId),
    cooldownSeconds(clubId),
    recentMatches(clubId),
  ]);
  return { club: summarise(club), cooldownSeconds: cooldown, challenge, recent };
}

/** AI clubs closest in power to `club`, best first, as candidate opponents. */
async function opponentCandidates(club: typeof clubs.$inferSelect) {
  const pool = await db()
    .select()
    .from(clubs)
    .where(and(isNull(clubs.UserId), ne(clubs.id, club.id)));
  return pool
    .sort((a, b) => Math.abs(a.Rating - club.Rating) - Math.abs(b.Rating - club.Rating))
    .slice(0, OPPONENT_POOL);
}

export async function playMatch(clubId: string): Promise<MatchResult> {
  const [club] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');

  const cooldown = await cooldownSeconds(clubId);
  if (cooldown > 0) throw new Error(`Your squad is resting - next match in ${cooldown}s`);

  const candidates = await opponentCandidates(club);
  if (!candidates.length) throw new Error('No opponent available right now');
  // Random pick from the closest-power pool; fall through to the next one if a
  // club can't field a match (e.g. too few signed players).
  const order = [...candidates].sort(() => Math.random() - 0.5);

  let fixtureId: string | null = null;
  let opponent = order[0];
  let lastError: unknown;
  for (const candidate of order) {
    opponent = candidate;
    const fixture = await createFixture({
      Title: `${club.Name} vs ${candidate.Name} ${MATCH_TITLE_MARK}`,
      Home: club.ClubCode,
      Away: candidate.ClubCode,
      HomeTeamId: club.id,
      AwayTeamId: candidate.id,
      Type: 'friendly',
      Status: 'friendly',
      Played: false,
      SaveStats: true,
    } as any);
    try {
      await play(fixture._id as string, {
        quickSim: true,
        skipStandings: true,
        skipDayAdvance: true,
        skipReplay: true,
      });
      fixtureId = fixture._id as string;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[play] match vs ${candidate.Name} failed:`, err);
    }
  }
  if (!fixtureId) {
    throw new Error(`Could not play a match: ${(lastError as Error)?.message ?? 'unknown error'}`);
  }

  const played = await getFixtureById(fixtureId);
  const { home, away } = scoresOf((played as any)?.Details);
  const outcome = outcomeFor(home, away);
  const reward = REWARDS[outcome];
  await payClub(clubId, reward, 'match_reward', `${club.Name} ${home}-${away} ${opponent.Name}`);
  const { completed } = await recordMatchForChallenge(clubId, outcome === 'win');

  // The gate for this match was credited by updateFixture; read it back.
  const [after] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  const entry = ((after.Finances as any)?.history ?? []).find(
    (h: any) => h.fixtureId === fixtureId
  );

  return {
    fixtureId,
    opponent: {
      id: opponent.id,
      name: opponent.Name,
      code: opponent.ClubCode,
      power: power(opponent.Rating),
    },
    score: { you: home, them: away },
    outcome,
    rewards: reward,
    gate: entry
      ? { attendance: entry.attendance, revenue: entry.revenue, costs: entry.costs, net: entry.net }
      : null,
    challengeCompleted: completed,
    state: await getPlayState(clubId),
  };
}
