import { and, desc, eq, inArray, isNull, like, ne } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, fixtures } from '../../db/drizzle/schema';
import { createFixture, getFixtureById } from '../../controllers/fixtures/fixture.service';
import { play } from '../../controllers/game/game.controller';
import { ensureChallenge, recordMatchForChallenge, type ChallengeState } from './challenge.service';
import { getAssetEffects } from '../facilities/facilities.service';
import { levelForXp, payClub, xpForLevel } from './rewards';
import { getStanding, type StandingView } from '../world/club-standing.service';
import { scaled } from './game-time';

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

/** Minimum gap between a club's matches, at the current game speed
 * (GAME_TIME_SCALE, which also scales upgrades and challenges). Override
 * the base with MATCH_COOLDOWN_SECONDS, e.g. 20 for local testing. */
export const MATCH_COOLDOWN_SECONDS = scaled(Number(process.env.MATCH_COOLDOWN_SECONDS) || 300);
/** Opponents are picked at random from this many closest-power AI clubs. */
const OPPONENT_POOL = 5;
const MATCH_TITLE_MARK = '(Matchmade)';

/** XP reward per outcome stays flat (drives club level, not cash). Cash is now
 * a share of THIS match's own gate net (see playMatch) - gate income scales
 * with Stadium level and used to dwarf a flat cash reward, so outcome barely
 * mattered financially past Stands Level 1. A % of gate keeps outcome
 * meaningful at every stadium size while keeping gate income the main
 * earner, as intended. */
const REWARD_XP = { win: 30, draw: 10, loss: 5 } as const;
const GATE_SHARE = { win: 0.5, draw: 0.1, loss: -0.15 } as const;
/** A win always pays at least this much cash, even at a Level 0 stadium. */
const MIN_WIN_CASH = 3_000;

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
  standing: StandingView;
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
  standingChange?: { fans: number; reputation: number; boardConfidence: number };
  state: PlayState;
  highlights?: Array<{ minute: number; type: string; message: string; side: 'you' | 'them' }>;
}


/** Matchmaking power: the club rating on a game-style scale (a 75 rating is
 * ~188 power), so "POWER 184 vs 177" reads well in the UI. */
const POWER_SCALE = 2.5;
const power = (rating: number | null | undefined) => Math.round((rating ?? 0) * POWER_SCALE);

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
  const cooldownMultiplier = (await getAssetEffects(clubId)).cooldownMultiplier ?? 1;
  const [last] = await db()
    .select({ playedAt: fixtures.PlayedAt })
    .from(fixtures)
    .where(matchmadeBy(clubId))
    .orderBy(desc(fixtures.PlayedAt))
    .limit(1);
  if (!last?.playedAt) return 0;
  const left = MATCH_COOLDOWN_SECONDS * cooldownMultiplier - (Date.now() - last.playedAt.getTime()) / 1000;
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
  const [challenge, cooldown, recent, standing] = await Promise.all([
    ensureChallenge(clubId),
    cooldownSeconds(clubId),
    recentMatches(clubId),
    getStanding(clubId),
  ]);
  return { club: summarise(club), standing, cooldownSeconds: cooldown, challenge, recent };
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

export interface OpponentOption {
  id: string;
  name: string;
  code: string;
  power: number;
}

const toOption = (c: typeof clubs.$inferSelect): OpponentOption => ({
  id: c.id,
  name: c.Name,
  code: c.ClubCode,
  power: power(c.Rating),
});

/**
 * Matchmaking preview: 1 + club-level opponent options (more experienced
 * clubs get a wider scouting picture of the closest-power pool). The first
 * option is the recommended (closest-power) one. Not gated by any facility -
 * Scouting instead drives the transfer shortlist (see transfer-market).
 */
export async function findOpponents(clubId: string): Promise<OpponentOption[]> {
  const [club] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');
  const options = 1 + Math.min(Math.floor(levelForXp(club.XP) / 2), 4);
  const candidates = await opponentCandidates(club);
  if (!candidates.length) throw new Error('No opponent available right now');
  // Recommended = closest; the rest are random from the remaining pool.
  const [closest, ...rest] = candidates;
  const extras = rest.sort(() => Math.random() - 0.5).slice(0, Math.max(options - 1, 0));
  return [closest, ...extras].map(toOption);
}

export async function playMatch(clubId: string, opponentId?: string): Promise<MatchResult> {
  const [club] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');

  const cooldown = await cooldownSeconds(clubId);
  if (cooldown > 0) throw new Error(`Your squad is resting - next match in ${cooldown}s`);

  const candidates = await opponentCandidates(club);
  if (!candidates.length) throw new Error('No opponent available right now');
  // Random pick from the closest-power pool; fall through to the next one if a
  // club can't field a match (e.g. too few signed players).
  let order = [...candidates].sort(() => Math.random() - 0.5);
  if (opponentId) {
    // The player chose from the matchmaking preview - it must still be in the pool.
    const chosen = candidates.find((c) => c.id === opponentId);
    if (!chosen) throw new Error('That opponent is no longer available - search again');
    order = [chosen];
  }

  // Stadium Grounds (pitch quality) and Staff House (coaching) both nudge
  // this match's simulation slightly in the home side's favour - a small,
  // never-persisted Rating bump (see buildSimulateMatchRequest.ts), rather
  // than a worker-thread config change. Kept modest: full marks on both is
  // a +3.5 Rating nudge, on a 0-100ish scale.
  const homeEffects = await getAssetEffects(clubId);
  const standingBefore = await getStanding(clubId);
  const homeRatingBonus =
    (homeEffects.pitchQuality ?? 0) * 0.3 + (homeEffects.coachingLevel ?? 0) * 0.4;

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
        homeRatingBonus,
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
  const { completed } = await recordMatchForChallenge(clubId, outcome === 'win');

  // The gate for this match was credited by updateFixture inside play();
  // read it back so the cash reward can be a share of THIS match's gate
  // (see GATE_SHARE) instead of a flat amount that gate income would dwarf.
  const [after] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  const entry = ((after.Finances as any)?.history ?? []).find(
    (h: any) => h.fixtureId === fixtureId
  );

  const gateNet = entry?.net ?? 0;
  const rewardCash =
    outcome === 'win'
      ? Math.max(Math.round(gateNet * GATE_SHARE.win), MIN_WIN_CASH)
      : Math.round(gateNet * GATE_SHARE[outcome]);
  const reward = { cash: rewardCash, xp: REWARD_XP[outcome] };
  await payClub(clubId, reward, 'match_reward', `${club.Name} ${home}-${away} ${opponent.Name}`);

  const rawEvents = Array.isArray((played as any)?.Events) ? (played as any).Events : [];
  const keyTypes = new Set(['goal', 'save', 'shot', 'foul', 'tackle']);
  const extractedHighlights: Array<{ minute: number; type: string; message: string; side: 'you' | 'them' }> = [];

  for (const ev of rawEvents) {
    if (!ev || !ev.type) continue;
    const isGoal = ev.type === 'goal' || String(ev.message || '').toLowerCase().includes('goal');
    if (!keyTypes.has(ev.type) && !isGoal) continue;

    const minMatch = typeof ev.time === 'string' ? ev.time.match(/\d+/) : null;
    let minute = minMatch ? parseInt(minMatch[0], 10) : Math.floor(Math.random() * 85) + 5;
    if (minute < 1 || minute > 90) minute = Math.min(Math.max(minute, 1), 90);

    const isYou = ev.playerTeamID ? ev.playerTeamID === clubId : ev.side === 'home';
    extractedHighlights.push({
      minute,
      type: ev.type,
      message: ev.message || (isGoal ? 'Goal!' : 'Key match event'),
      side: isYou ? 'you' : 'them',
    });
  }

  // Ensure every scored goal is guaranteed in the highlights timeline
  const yourGoalCount = extractedHighlights.filter((e) => e.type === 'goal' && e.side === 'you').length;
  const theirGoalCount = extractedHighlights.filter((e) => e.type === 'goal' && e.side === 'them').length;

  for (let i = yourGoalCount; i < home; i++) {
    const min = Math.min(18 + i * 25 + Math.floor(Math.random() * 8), 89);
    extractedHighlights.push({
      minute: min,
      type: 'goal',
      message: `GOAL! ${club.Name} scores!`,
      side: 'you',
    });
  }

  for (let i = theirGoalCount; i < away; i++) {
    const min = Math.min(22 + i * 28 + Math.floor(Math.random() * 8), 88);
    extractedHighlights.push({
      minute: min,
      type: 'goal',
      message: `GOAL! ${opponent.Name} finds the net!`,
      side: 'them',
    });
  }

  extractedHighlights.sort((a, b) => a.minute - b.minute);

  // updateFixture already moved the standing; report the difference.
  const state = await getPlayState(clubId);
  const standingChange = {
    fans: state.standing.fans - standingBefore.fans,
    reputation: state.standing.reputation - standingBefore.reputation,
    boardConfidence: state.standing.boardConfidence - standingBefore.boardConfidence,
  };

  return {
    fixtureId,
    opponent: toOption(opponent),
    score: { you: home, them: away },
    outcome,
    rewards: reward,
    gate: entry
      ? { attendance: entry.attendance, revenue: entry.revenue, costs: entry.costs, net: entry.net }
      : null,
    challengeCompleted: completed,
    standingChange,
    state,
    highlights: extractedHighlights.slice(0, 15),
  };
}

