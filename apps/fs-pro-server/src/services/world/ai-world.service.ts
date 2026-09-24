import { and, eq, gte, inArray, isNull, like, sum } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, fixtures, players } from '../../db/drizzle/schema';
import { createFixture } from '../../controllers/fixtures/fixture.service';
import { play } from '../../controllers/game/game.controller';
import { getCampus, startUpgrade } from '../facilities/facilities.service';
import { runAiMarket, type AiMarketSummary } from '../transfers/transfer-market.service';
import { scaled } from '../play/game-time';

/**
 * The AI world moving on its own, in real time, with nobody online: AI clubs
 * play each other (which moves their standing and earns gate income through
 * the usual updateFixture seam), invest spare cash in facilities, and manage
 * their squads (need signings, debt sales, trades - runAiMarket).
 *
 * Runs every WORLD_TICK_MINUTES (scaled by GAME_TIME_SCALE). Set
 * WORLD_TICK_MINUTES=0 to switch it off.
 */

const db = () => DrizzleDatabase.getInstance().database;

const WORLD_MATCH_MARK = '(World)';
/** Real minutes between ticks at game speed 1. */
const TICK_MINUTES = Number(process.env.WORLD_TICK_MINUTES ?? 10);
/** Matches played per tick. */
const MATCHES_PER_TICK = 4;
/** An AI club rests this long (game speed 1) between world matches. */
const MATCH_REST_MINUTES = 60;
/** Chance per tick that an AI club with spare cash starts a facility upgrade. */
const INVEST_CHANCE = 0.15;
/** Cash an AI club keeps back before investing: half a year's wages, at least 1M. */
const RESERVE_WAGE_SHARE = 0.5;
const MIN_RESERVE = 1_000_000;
/** Income first: when levels tie, the earlier asset is built first. */
const INVEST_PRIORITY = [
  'stands',
  'training_ground',
  'youth_academy',
  'medical_centre',
  'stadium_grounds',
  'staff_house',
  'scouting',
];

type ClubRow = typeof clubs.$inferSelect;

export interface WorldTickSummary {
  matches: { home: string; away: string; score: string }[];
  upgrades: { club: string; asset: string; toLevel: number }[];
  market: AiMarketSummary | null;
}

async function aiClubs(): Promise<ClubRow[]> {
  return db().select().from(clubs).where(isNull(clubs.UserId));
}

/** AI clubs that played a world match recently and are still resting. */
async function restingClubIds(): Promise<Set<string>> {
  const since = new Date(Date.now() - scaled(MATCH_REST_MINUTES) * 60_000);
  const rows = await db()
    .select({ home: fixtures.HomeTeamId, away: fixtures.AwayTeamId })
    .from(fixtures)
    .where(and(like(fixtures.Title, `%${WORLD_MATCH_MARK}`), gte(fixtures.PlayedAt, since)));
  return new Set(rows.flatMap((r) => [r.home, r.away]).filter((id): id is string => !!id));
}

/** Pairs rested AI clubs of similar power and plays their matches. */
async function playWorldMatches(pool: ClubRow[]): Promise<WorldTickSummary['matches']> {
  const resting = await restingClubIds();
  const available = pool.filter((c) => !resting.has(c.id)).sort(() => Math.random() - 0.5);
  const played: WorldTickSummary['matches'] = [];

  while (played.length < MATCHES_PER_TICK && available.length >= 2) {
    const a = available.shift()!;
    // Closest power among the rest, so results aren't foregone conclusions.
    available.sort((x, y) => Math.abs(x.Rating - a.Rating) - Math.abs(y.Rating - a.Rating));
    const b = available.shift()!;
    const [home, away] = Math.random() < 0.5 ? [a, b] : [b, a];

    const fixture = await createFixture({
      Title: `${home.Name} vs ${away.Name} ${WORLD_MATCH_MARK}`,
      Home: home.ClubCode,
      Away: away.ClubCode,
      HomeTeamId: home.id,
      AwayTeamId: away.id,
      Type: 'friendly',
      Status: 'friendly',
      Played: false,
      // Keeps the world light: no per-player stat rows or fatigue for AI-vs-AI.
      SaveStats: false,
    } as any);
    try {
      await play(fixture._id as string, {
        quickSim: true,
        skipStandings: true,
        skipDayAdvance: true,
        skipReplay: true,
      });
      const [row] = await db()
        .select({ Details: fixtures.Details })
        .from(fixtures)
        .where(eq(fixtures.id, fixture._id as string));
      const d: any = row?.Details ?? {};
      played.push({
        home: home.Name,
        away: away.Name,
        score: `${d.HomeTeamScore ?? '?'}-${d.AwayTeamScore ?? '?'}`,
      });
    } catch (err) {
      console.warn(`[world] ${home.Name} vs ${away.Name} could not be played:`, (err as Error).message);
    }
  }
  return played;
}

/** AI clubs with cash beyond their reserve build their weakest facility. */
async function investInFacilities(pool: ClubRow[]): Promise<WorldTickSummary['upgrades']> {
  const wageRows = await db()
    .select({ clubId: players.ClubId, wages: sum(players.Wage) })
    .from(players)
    .where(and(inArray(players.ClubId, pool.map((c) => c.id)), eq(players.isRetired, false)))
    .groupBy(players.ClubId);
  const wagesOf = new Map(wageRows.map((r) => [r.clubId, Number(r.wages ?? 0)]));

  const started: WorldTickSummary['upgrades'] = [];
  for (const club of pool) {
    if (Math.random() > INVEST_CHANCE) continue;
    const reserve = Math.max((wagesOf.get(club.id) ?? 0) * RESERVE_WAGE_SHARE, MIN_RESERVE);
    const spare = (club.Budget ?? 0) - reserve;
    if (spare <= 0) continue;

    const campus = await getCampus(club.id);
    if (campus.activeUpgrades > 0) continue;
    // One of the three weakest affordable assets, so clubs don't all build
    // the same thing (and end up with different identities).
    const options = campus.assets
      .filter((a) => a.next && !a.next.blockedReason && a.next.cost <= spare)
      .sort(
        (x, y) =>
          x.level - y.level || INVEST_PRIORITY.indexOf(x.type) - INVEST_PRIORITY.indexOf(y.type)
      )
      .slice(0, 3);
    const choice = options[Math.floor(Math.random() * options.length)];
    if (!choice?.next) continue;

    try {
      await startUpgrade(club.id, choice.type);
      started.push({ club: club.Name, asset: choice.name, toLevel: choice.next.level });
    } catch (err) {
      console.warn(`[world] ${club.Name} could not upgrade ${choice.name}:`, (err as Error).message);
    }
  }
  return started;
}

let running = false;

/** One pass of the AI world. Never overlaps itself. */
export async function runWorldTick(): Promise<WorldTickSummary | null> {
  if (running) return null;
  running = true;
  try {
    const summary: WorldTickSummary = { matches: [], upgrades: [], market: null };
    const pool = await aiClubs();
    summary.matches = await playWorldMatches(pool);
    // Re-read budgets after gate income from the matches.
    summary.upgrades = await investInFacilities(await aiClubs());
    try {
      summary.market = await runAiMarket();
    } catch (err) {
      console.error('[world] AI market failed:', err);
    }
    return summary;
  } finally {
    running = false;
  }
}

let tickTimer: NodeJS.Timeout | null = null;

export function startWorldTick() {
  if (tickTimer || !(TICK_MINUTES > 0)) {
    if (!(TICK_MINUTES > 0)) console.log('[world] AI world tick disabled (WORLD_TICK_MINUTES=0)');
    return;
  }
  const intervalMs = Math.max(scaled(TICK_MINUTES) * 60_000, 30_000);
  tickTimer = setInterval(() => {
    runWorldTick()
      .then((s) => {
        if (!s) return;
        const m = s.market;
        console.log(
          `[world] ${s.matches.length} match(es), ${s.upgrades.length} upgrade(s)` +
            (m ? `, ${m.aiNeedSignings} need signing(s), ${m.aiDeals} deal(s), ${m.debtSales} debt sale(s), ${m.debtListings} listing(s)` : '')
        );
      })
      .catch((err) => console.error('[world] tick failed:', err));
  }, intervalMs);
  tickTimer.unref();
  console.log(`[world] AI world tick every ${Math.round(intervalMs / 1000)}s`);
}
