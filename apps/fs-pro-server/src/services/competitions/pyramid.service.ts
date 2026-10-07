import { and, desc, eq, inArray, isNotNull, isNull, max, or, sql } from 'drizzle-orm';
import { leagueDays, type CompetitionDefinition, type LeagueRules, type StageDefinition } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  awards,
  calendars,
  clubs,
  competitions,
  entries,
  fixtures,
  places,
  pools,
  rankings,
  seasons,
  transferLedger,
} from '../../db/drizzle/schema';
import { roundCount, roundRobin } from '../../utils/round-robin';
import { addXp, changeLevel } from '../world/level-change';
import { levelForXp } from '../world/level';
import { DEFAULT_LEAGUE_RULES } from './definition';
import { rankRows, type RankedRow } from './ranking';
import { drawPyramid as clientDrawPyramid, joinPyramid as clientJoinPyramid } from '../world/world-service.client';

/**
 * Pyramid leagues (docs/WORLD-PYRAMID-SPEC.md, "Pyramid league"): one
 * competition per country whose single stage is a `pyramid`. Each Year is
 * one edition: at year end the running edition finishes (finishPyramid) and
 * the next is drawn (drawPyramid). The draw sorts the country's clubs into
 * divisions (top pool of `poolSize`, then 2, 4, 8... pools) by last year's
 * movement, Level and XP, cuts each division into local pools (by region
 * and town), and writes every fixture up front: a round-robin over pool
 * slots, round r on the r-th league day of the year, at the pool's kickoff
 * hour. The bottom division keeps spare slots that clubs founded mid-season
 * take (joinPyramid).
 *
 * tickEditions never touches these editions; everything here is driven by
 * the year end and by founding.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Db = ReturnType<typeof db>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Season = typeof seasons.$inferSelect;
type Calendar = typeof calendars.$inferSelect;
export type PyramidStage = Extract<StageDefinition, { type: 'pyramid' }>;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Prize money and XP shrink by this per division down. */
const DIVISION_REWARD_FACTOR = 0.6;
/** Bottom-division tables rank by points per game: late joiners play fewer. */
const BOTTOM_RULES: Partial<LeagueRules> = { metric: 'ppg', minGamesToRank: 4 };
const DEFAULT_PYRAMID_RULES: Partial<LeagueRules> = { metric: 'points', minGamesToRank: 0, maxGames: null };

export const DEFAULT_PYRAMID_STAGE: PyramidStage = {
  type: 'pyramid',
  poolSize: 10,
  rounds: 2,
  promote: 2,
  relegate: 2,
  bottomFill: 0.8,
};

export function isPyramid(def: Pick<CompetitionDefinition, 'Stages'> | null | undefined) {
  return def?.Stages?.length === 1 && def.Stages[0]!.type === 'pyramid';
}

export function pyramidStage(def: Pick<CompetitionDefinition, 'Stages'> | null | undefined): PyramidStage | null {
  const stage = def?.Stages?.[0];
  return stage?.type === 'pyramid' ? stage : null;
}

/** Table rules for a pool: the stage's rules on pyramid defaults, plus
 * points per game in the bottom division. */
export function poolRules(stage: PyramidStage, bottom: boolean, worldDefaults?: Partial<LeagueRules> | null): LeagueRules {
  return {
    ...DEFAULT_LEAGUE_RULES,
    ...worldDefaults,
    ...DEFAULT_PYRAMID_RULES,
    ...stage.rules,
    ...(bottom ? BOTTOM_RULES : {}),
  };
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface DivisionShape {
  division: number;
  /** Clubs the draw puts in this division. */
  clubs: number;
  /** Pool sizes (slots), one per pool. */
  poolSizes: number[];
  /** Clubs per pool at the draw. */
  poolClubs: number[];
}

/**
 * How `n` clubs fill the pyramid: full divisions top down (division d has
 * 2^(d-1) pools of `poolSize`) while at least 2 clubs would be left for the
 * next one; the rest make the bottom division, spread evenly over enough
 * pools to fill about `bottomFill` of their slots. A world small enough for
 * one pool (n <= poolSize + 1) gets one pool of n.
 */
export function pyramidShape(n: number, poolSize: number, bottomFill: number): DivisionShape[] {
  if (n <= 0) return [{ division: 1, clubs: 0, poolSizes: [poolSize], poolClubs: [0] }];
  if (n <= poolSize + 1) {
    return [{ division: 1, clubs: n, poolSizes: [Math.max(poolSize, n)], poolClubs: [n] }];
  }
  const out: DivisionShape[] = [];
  let rest = n;
  let d = 1;
  for (;;) {
    const pools = 2 ** (d - 1);
    const cap = pools * poolSize;
    if (rest - cap >= 2) {
      out.push({ division: d, clubs: cap, poolSizes: Array(pools).fill(poolSize), poolClubs: Array(pools).fill(poolSize) });
      rest -= cap;
      d++;
      continue;
    }
    const bottomPools = d === 1 ? 1 : Math.max(1, Math.ceil(rest / (poolSize * bottomFill)));
    const base = Math.floor(rest / bottomPools);
    const extra = rest % bottomPools;
    const poolClubs = Array.from({ length: bottomPools }, (_, i) => base + (i < extra ? 1 : 0));
    out.push({ division: d, clubs: rest, poolSizes: Array(bottomPools).fill(poolSize), poolClubs });
    return out;
  }
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

interface DrawClub {
  id: string;
  code: string;
  name: string;
  xp: number;
  elo: number;
  level: number;
  regionKey: string;
  townKey: string;
  regionId: string | null;
  /** Division the club should play in (from last year), or Infinity. */
  desired: number;
}

/** The league days of the year (day kinds count from the year's first
 * day), from `fromDay` on, in order. Round r plays on the r-th. */
function editionLeagueDays(calendar: Pick<Calendar, 'WeekTemplate' | 'YearStartDay'>, endDay: number, fromDay: number) {
  return leagueDays({
    WeekTemplate: calendar.WeekTemplate,
    YearStartDay: calendar.YearStartDay,
    YearLengthDays: endDay - calendar.YearStartDay + 1,
  }).filter((d) => d >= fromDay);
}

/** Rounds a pool plays: its stage's legs, or one leg when two don't fit in
 * the year's league days. */
function poolLegs(size: number, stage: PyramidStage, leagueDayCount: number): 1 | 2 {
  return stage.rounds === 2 && roundCount(size, 2) <= leagueDayCount ? 2 : 1;
}

async function world(tx: Tx | Db = db()) {
  const [calendar] = await tx.select().from(calendars).limit(1);
  if (!calendar) throw new Error('No calendar row: the game world has not been set up');
  return calendar;
}

const dateOf = (calendar: Calendar, day: number) =>
  new Date(calendar.CurrentDate.getTime() + (day - calendar.CurrentDay) * DAY_MS);

/** Each club's division next season from its last pyramid edition. */
async function desiredDivisions(competitionId: string): Promise<Map<string, number>> {
  const [last] = await db()
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.CompetitionId, competitionId), eq(seasons.Status, 'finished')))
    .orderBy(desc(seasons.EditionNumber))
    .limit(1);
  if (!last) return new Map();
  const rows = await db()
    .select({ clubId: entries.ClubId, division: entries.Division, movement: entries.Movement })
    .from(entries)
    .where(and(eq(entries.SeasonId, last.id), isNotNull(entries.Division)));
  return new Map(rows.map((r) => [r.clubId, Math.max(1, r.division! - (r.movement ?? 0))]));
}

/** Pool names: "<Country> Premier", then "<Country> D<n> · <Region>". */
function poolNames(country: string, division: number, regionNames: (string | null)[]): string[] {
  if (division === 1 && regionNames.length === 1) return [`${country} Premier`];
  const roman = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
  const seen = new Map<string, number>();
  return regionNames.map((r) => {
    const base = `${country} D${division}${r ? ` · ${r}` : ''}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}${roman[n] ?? ` ${n + 1}`}`;
  });
}

const mostCommon = <T>(xs: T[]): T | null => {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestN = 0;
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1;
    counts.set(x, n);
    if (n > bestN) [best, bestN] = [x, n];
  }
  return best;
};

export interface DrawSummary {
  seasonId: string;
  competitionId: string;
  clubs: number;
  divisions: number;
  pools: number;
  fixtures: number;
}

/** The running pyramid edition of a competition, if any. */
export async function runningPyramid(competitionId: string, tx: Tx | Db = db()) {
  const [season] = await tx
    .select()
    .from(seasons)
    .where(and(eq(seasons.CompetitionId, competitionId), eq(seasons.Status, 'running')))
    .limit(1);
  return season ?? null;
}

/**
 * Draw this year's edition of a pyramid competition for every club in its
 * country, and write every fixture. Does nothing (returns null) when an
 * edition is already running. Runs from the year's first day (or `fromDay`)
 * to its last.
 */
export async function drawPyramid(competitionId: string, opts: { fromDay?: number } = {}): Promise<DrawSummary | null> {
  const [competition] = await db().select().from(competitions).where(eq(competitions.id, competitionId));
  if (!competition) throw new Error(`Competition ${competitionId} not found`);
  const def = {
    Name: competition.Name,
    Prestige: competition.Prestige,
    Entry: competition.Entry,
    Stages: competition.Stages,
    WinCondition: competition.WinCondition,
    Rewards: competition.Rewards,
    Outcomes: competition.Outcomes ?? undefined,
    Recurrence: competition.Recurrence ?? null,
  } as CompetitionDefinition;
  const stage = pyramidStage(def);
  if (!stage) throw new Error(`${competition.CompetitionCode} is not a pyramid league`);
  const countryId = def.Entry.countryIds?.[0];
  if (!countryId) throw new Error(`${competition.CompetitionCode} has no country`);

  return db().transaction(async (tx) => {
    // One draw at a time per competition.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pyramid:${competitionId}`}))`);
    if (await runningPyramid(competitionId, tx)) return null;

    const calendar = await world(tx);
    const startDay = Math.max(calendar.YearStartDay, opts.fromDay ?? calendar.YearStartDay);
    const endDay = calendar.YearStartDay + calendar.YearLengthDays - 1;
    const days = editionLeagueDays(calendar, endDay, startDay);

    const [country] = await tx.select().from(places).where(eq(places.id, countryId));

    // The country's clubs with their strength and locality. Migration 0038:
    // a club's region comes from its district (Clubs.DistrictId -> RegionId).
    const rows = await tx
      .select({
        id: clubs.id,
        code: clubs.ClubCode,
        name: clubs.Name,
        xp: clubs.XP,
        elo: clubs.Elo,
        regionId: places.RegionId,
      })
      .from(clubs)
      .leftJoin(places, eq(places.id, clubs.DistrictId))
      .where(and(eq(clubs.AddressCountryId, countryId), isNull(clubs.ReleasedAt)));
    if (!rows.length) return null;

    const regionRows = await tx
      .select({ id: places.id, name: places.Name, createdAt: places.createdAt })
      .from(places)
      .where(and(eq(places.Type, 'region'), eq(places.ParentId, countryId)));
    const regionName = new Map(regionRows.map((r) => [r.id, r.name]));

    const detail = new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          code: r.code,
          name: r.name,
          xp: r.xp,
          elo: r.elo,
          level: levelForXp(r.xp, calendar.LevelThresholds ?? undefined),
          regionId: r.regionId,
        },
      ])
    );

    // The Go world-service decides the pool assignment (WORLD-SERVICE-CONTRACT
    // §4, WORLD-HIERARCHY-SPEC §6.2/§6.5); Node persists entries/pools/fixtures.
    let assignment;
    try {
      assignment = await clientDrawPyramid(competitionId);
    } catch (err) {
      // No drawable edition (or the service is down): behave like the old
      // "no clubs" path rather than failing the year-end.
      console.warn(`[pyramid] world-service draw unavailable for ${competitionId}`, err);
      return null;
    }
    if (!assignment.pools.length) return null;

    const byDivision = new Map<number, typeof assignment.pools>();
    for (const p of assignment.pools) byDivision.set(p.division, [...(byDivision.get(p.division) ?? []), p]);
    const divisions = [...byDivision.keys()].sort((a, b) => a - b);
    const bottomDivision = divisions[divisions.length - 1]!;

    // The edition.
    const [{ last }] = await tx
      .select({ last: max(seasons.EditionNumber) })
      .from(seasons)
      .where(eq(seasons.CompetitionId, competitionId));
    const number = (last ?? 0) + 1;
    const [season] = await tx
      .insert(seasons)
      .values({
        SeasonCode: `${competition.CompetitionCode.toUpperCase()}-E${number}`,
        Title: `${competition.Name} · Year ${calendar.CurrentYear}`,
        StartDate: dateOf(calendar, startDay),
        EndDate: dateOf(calendar, endDay),
        CompetitionId: competitionId,
        CompetitionCode: competition.CompetitionCode,
        EditionNumber: number,
        Status: 'running',
        StartDay: startDay,
        EndDay: endDay,
        CurrentStage: 0,
        StageStartedDay: startDay,
        Definition: def,
        updatedAt: new Date(),
      })
      .returning();

    // Kickoff hours are dealt across every pool in the world this year.
    const hours = calendar.KickoffHours?.length ? calendar.KickoffHours : [19];
    const [{ dealt }] = await tx
      .select({ dealt: sql<number>`count(*)::int` })
      .from(pools)
      .innerJoin(seasons, eq(seasons.id, pools.SeasonId))
      .where(eq(seasons.Status, 'running'));
    let hourIndex = dealt;

    let poolCount = 0;
    let fixtureCount = 0;
    const entryRows: (typeof entries.$inferInsert)[] = [];
    const rankingRows: (typeof rankings.$inferInsert)[] = [];
    const fixtureRows: (typeof fixtures.$inferInsert)[] = [];

    for (const division of divisions) {
      const divisionPools = byDivision.get(division)!;
      const names = poolNames(
        country?.Name ?? competition.Name,
        division,
        divisionPools.map((p) => {
          const r = mostCommon(p.clubIds.map((id) => detail.get(id)?.regionId).filter((x): x is string => !!x));
          return r ? (regionName.get(r) ?? null) : null;
        })
      );

      for (const [i, pool] of divisionPools.entries()) {
        const members = pool.clubIds.map((id) => detail.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
        if (!members.length) continue;
        // A single oversized pool (n <= poolSize+1) keeps its real size.
        const size = Math.max(stage.poolSize, members.length);
        const kickoff = hours[hourIndex++ % hours.length]!;
        const [poolRow] = await tx
          .insert(pools)
          .values({
            SeasonId: season!.id,
            Division: division,
            Number: i,
            Name: names[i]!,
            RegionId: mostCommon(members.map((m) => m.regionId).filter((x): x is string => !!x)),
            KickoffHour: kickoff,
            Size: size,
          })
          .returning();
        poolCount++;

        // Strongest first in slot order so seeds read naturally.
        const bySlot = [...members].sort((a, b) => b.level - a.level || b.xp - a.xp || a.id.localeCompare(b.id));
        bySlot.forEach((m, slot) => {
          entryRows.push({
            SeasonId: season!.id,
            ClubId: m.id,
            Status: 'active',
            Seed: slot + 1,
            Group: poolRow!.id,
            Division: division,
            PoolSlot: slot,
            updatedAt: new Date(),
          });
          rankingRows.push({
            SeasonId: season!.id,
            StageIndex: 0,
            ClubId: m.id,
            Group: poolRow!.id,
            EloStart: m.elo,
            updatedAt: new Date(),
          });
        });

        const legs = poolLegs(size, stage, days.length);
        const schedule = roundRobin(size, legs);
        schedule.forEach((round, r) => {
          const day = days[r];
          if (day == null) return; // more rounds than league days left
          for (const p of round) {
            const home = bySlot[p.home];
            const away = bySlot[p.away];
            if (!home || !away) continue; // an open slot
            fixtureRows.push(
              leagueFixture(season!, competition.CompetitionCode, competitionId, r + 1, home, away, day, kickoff, calendar)
            );
          }
        });
      }
    }

    for (let i = 0; i < entryRows.length; i += 1000) await tx.insert(entries).values(entryRows.slice(i, i + 1000));
    for (let i = 0; i < rankingRows.length; i += 1000) await tx.insert(rankings).values(rankingRows.slice(i, i + 1000));
    for (let i = 0; i < fixtureRows.length; i += 500) {
      await tx.insert(fixtures).values(fixtureRows.slice(i, i + 500));
      fixtureCount += Math.min(500, fixtureRows.length - i);
    }

    return {
      seasonId: season!.id,
      competitionId,
      clubs: rows.length,
      divisions: bottomDivision,
      pools: poolCount,
      fixtures: fixtureCount,
    };
  });
}

function leagueFixture(
  season: Season,
  leagueCode: string,
  competitionId: string,
  round: number,
  home: { id: string; code: string; name: string },
  away: { id: string; code: string; name: string },
  day: number,
  kickoffHour: number,
  calendar: Calendar
): typeof fixtures.$inferInsert {
  return {
    Title: `${home.name} vs ${away.name}`,
    SeasonId: season.id,
    SeasonCode: season.SeasonCode,
    LeagueCode: leagueCode,
    CompetitionId: competitionId,
    StageIndex: 0,
    Stage: 'lg-match',
    Type: 'league',
    Round: round,
    Home: home.code,
    Away: away.code,
    HomeTeamId: home.id,
    AwayTeamId: away.id,
    ScheduledDay: day,
    ScheduledDate: dateOf(calendar, day),
    KickoffHour: kickoffHour,
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Joining mid-season
// ---------------------------------------------------------------------------

export interface JoinedPool {
  seasonId: string;
  poolId: string;
  name: string;
  division: number;
  fixtures: number;
}

/**
 * Put a club into its country's running pyramid edition: an open slot of a
 * bottom-division pool (its own region's first, then the emptiest), or a
 * new bottom-division pool when none has room; then its fixtures for every
 * round still to come. Returns the existing pool if it's already in.
 */
export async function joinPyramid(competitionId: string, clubId: string): Promise<JoinedPool | null> {
  return db().transaction(async (tx) => {
    const season = await runningPyramid(competitionId, tx);
    if (!season) return null;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pyramid:${competitionId}`}))`);
    const stage = pyramidStage(season.Definition);
    if (!stage) return null;

    const [existing] = await tx
      .select({ group: entries.Group, division: entries.Division })
      .from(entries)
      .where(and(eq(entries.SeasonId, season.id), eq(entries.ClubId, clubId)));
    if (existing?.group) {
      const [pool] = await tx.select().from(pools).where(eq(pools.id, existing.group));
      return pool ? { seasonId: season.id, poolId: pool.id, name: pool.Name, division: pool.Division, fixtures: 0 } : null;
    }

    // Migration 0038: region comes from the club's district.
    const [club] = await tx
      .select({ id: clubs.id, code: clubs.ClubCode, name: clubs.Name, elo: clubs.Elo, regionId: places.RegionId })
      .from(clubs)
      .leftJoin(places, eq(places.id, clubs.DistrictId))
      .where(eq(clubs.id, clubId));
    if (!club) return null;

    const calendar = await world(tx);
    const all = await tx.select().from(pools).where(eq(pools.SeasonId, season.id));

    // The Go world-service picks the bottom-division slot (WORLD-SERVICE-
    // CONTRACT §4); Node creates the pool when none has room and persists.
    let join;
    try {
      join = await clientJoinPyramid({ competitionId, clubId });
    } catch (err) {
      console.warn(`[pyramid] world-service join unavailable for ${competitionId}`, err);
      return null;
    }

    let pool = join.poolId ? all.find((p) => p.id === join.poolId) : undefined;
    if (join.poolId && !pool) return null;
    if (!pool) {
      const hours = calendar.KickoffHours?.length ? calendar.KickoffHours : [19];
      const division = join.division;
      const siblings = all.filter((p) => p.Division === division);
      const [country] = await tx.select({ name: places.Name }).from(places).where(eq(places.id, season.Definition!.Entry.countryIds![0]!));
      const [region] = club.regionId
        ? await tx.select({ name: places.Name }).from(places).where(eq(places.id, club.regionId))
        : [];
      const base = poolNames(country?.name ?? season.Title, division, [region?.name ?? null])[0]!;
      const taken = new Set(all.map((p) => p.Name));
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
      [pool] = await tx
        .insert(pools)
        .values({
          SeasonId: season.id,
          Division: division,
          Number: siblings.length,
          Name: name,
          RegionId: club.regionId,
          KickoffHour: hours[all.length % hours.length]!,
          Size: stage.poolSize,
        })
        .returning();
    }

    const slot = join.poolId ? join.slot : 0;
    await tx.insert(entries).values({
      SeasonId: season.id,
      ClubId: club.id,
      Status: 'active',
      Seed: slot + 1,
      Group: pool.id,
      Division: pool.Division,
      PoolSlot: slot,
      updatedAt: new Date(),
    });
    await tx
      .insert(rankings)
      .values({ SeasonId: season.id, StageIndex: 0, ClubId: club.id, Group: pool.id, EloStart: club.elo, updatedAt: new Date() })
      .onConflictDoNothing();

    // Remaining rounds against the pool's filled slots.
    const members = await tx
      .select({ id: clubs.id, code: clubs.ClubCode, name: clubs.Name, slot: entries.PoolSlot })
      .from(entries)
      .innerJoin(clubs, eq(clubs.id, entries.ClubId))
      .where(and(eq(entries.SeasonId, season.id), eq(entries.Group, pool.id)));
    const bySlot = new Map(members.map((m) => [m.slot!, m]));
    const days = editionLeagueDays(calendar, season.EndDay ?? calendar.CurrentDay, season.StartDay ?? calendar.YearStartDay);
    const legs = poolLegs(pool.Size, stage, days.length);
    const rows: (typeof fixtures.$inferInsert)[] = [];
    roundRobin(pool.Size, legs).forEach((round, r) => {
      const day = days[r];
      if (day == null || day <= calendar.CurrentDay) return;
      for (const p of round) {
        if (p.home !== slot && p.away !== slot) continue;
        const home = bySlot.get(p.home);
        const away = bySlot.get(p.away);
        if (!home || !away) continue;
        rows.push(leagueFixture(season, season.CompetitionCode, competitionId, r + 1, home, away, day, pool.KickoffHour, calendar));
      }
    });
    if (rows.length) await tx.insert(fixtures).values(rows);
    return { seasonId: season.id, poolId: pool.id, name: pool.Name, division: pool.Division, fixtures: rows.length };
  });
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export interface PoolTable {
  pool: typeof pools.$inferSelect;
  bottom: boolean;
  rules: LeagueRules;
  rows: RankedRow<typeof rankings.$inferSelect>[];
}

/** Pools of a pyramid edition (all, or one), each with its ranked table. */
export async function poolTables(seasonId: string, poolId?: string): Promise<PoolTable[]> {
  const [season] = await db().select().from(seasons).where(eq(seasons.id, seasonId));
  const stage = pyramidStage(season?.Definition);
  if (!season || !stage) return [];
  const calendar = await world();
  const all = await db().select().from(pools).where(eq(pools.SeasonId, seasonId));
  const bottom = Math.max(0, ...all.map((p) => p.Division));
  const wanted = poolId ? all.filter((p) => p.id === poolId) : all;
  if (!wanted.length) return [];
  const rows = await db()
    .select()
    .from(rankings)
    .where(
      and(
        eq(rankings.SeasonId, seasonId),
        poolId ? eq(rankings.Group, poolId) : undefined
      )
    );
  const byPool = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) byPool.set(r.Group ?? '', [...(byPool.get(r.Group ?? '') ?? []), r]);
  return wanted
    .sort((a, b) => a.Division - b.Division || a.Number - b.Number)
    .map((pool) => {
      const isBottom = pool.Division === bottom && bottom > 1;
      const rules = poolRules(stage, isBottom, calendar.DefaultRules);
      return { pool, bottom: isBottom, rules, rows: rankRows(byPool.get(pool.id) ?? [], rules) };
    });
}

/** The pool rules for each group (pool id) of a pyramid edition, for
 * ranking.service's generic tables. */
export async function pyramidGroupRules(seasonId: string, worldDefaults?: Partial<LeagueRules> | null) {
  const [season] = await db().select().from(seasons).where(eq(seasons.id, seasonId));
  const stage = pyramidStage(season?.Definition);
  if (!stage) return null;
  const all = await db().select({ id: pools.id, division: pools.Division }).from(pools).where(eq(pools.SeasonId, seasonId));
  const bottom = Math.max(0, ...all.map((p) => p.division));
  return new Map(all.map((p) => [p.id, poolRules(stage, p.division === bottom && bottom > 1, worldDefaults)]));
}

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------

export interface PyramidFinish {
  seasonId: string;
  champions: string | null;
  promoted: string[];
  relegated: string[];
}

/**
 * End a pyramid edition at year end: rank every pool, write positions,
 * finish scores and movement, pay prize money and XP (shrinking by division),
 * give each pool winner a trophy, promote and relegate (Level, and the next
 * draw's division). `span` is the year that just ended; the edition is dated
 * on its last day so it counts in that year's performance.
 */
export async function finishPyramid(
  seasonId: string,
  span: { year: number; fromDay: number; toDay: number }
): Promise<PyramidFinish | null> {
  const tables = await poolTables(seasonId);
  const [season] = await db().select().from(seasons).where(eq(seasons.id, seasonId));
  const stage = pyramidStage(season?.Definition);
  if (!season || !stage || season.Status !== 'running') return null;
  const def = season.Definition!;
  const calendar = await world();
  const divisions = Math.max(0, ...tables.map((t) => t.pool.Division));

  const promoted: string[] = [];
  const relegated: string[] = [];
  // The national champions: the winner of division 1 when it is one pool.
  const top = tables.filter((t) => t.pool.Division === 1);
  const champions = top.length === 1 ? (top[0]!.rows.find((r) => r.rank != null)?.row.ClubId ?? null) : null;

  await db().transaction(async (tx) => {
    const flipped = await tx
      .update(seasons)
      .set({ Status: 'finished', EndDay: span.toDay, updatedAt: new Date() })
      .where(and(eq(seasons.id, seasonId), eq(seasons.Status, 'running')))
      .returning({ id: seasons.id });
    if (!flipped.length) return;

    for (const t of tables) {
      const d = t.pool.Division;
      const factor = DIVISION_REWARD_FACTOR ** (d - 1);
      const n = t.rows.length;
      const ranked = t.rows.filter((r) => r.rank != null);
      const up = d > 1 ? ranked.slice(0, stage.promote).map((r) => r.row.ClubId) : [];
      // Relegation from the bottom division would go nowhere.
      const downFrom = Math.max(up.length, n - stage.relegate);
      const down = d < divisions ? t.rows.slice(downFrom).map((r) => r.row.ClubId) : [];

      for (const [i, r] of t.rows.entries()) {
        const clubId = r.row.ClubId;
        const position = i + 1;
        const movement = up.includes(clubId) ? 1 : down.includes(clubId) ? -1 : 0;
        const score = r.rank == null ? 0 : n <= 1 ? 1 : Math.round((1 - (position - 1) / (n - 1)) * 1000) / 1000;
        await tx
          .update(entries)
          .set({ FinalPosition: position, FinishScore: score, Movement: movement, updatedAt: new Date() })
          .where(and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, clubId)));

        if (r.rank == null) continue;
        const prize = Math.round((def.Rewards.prizeMoney.find((p) => p.position === position)?.amount ?? 0) * factor);
        if (prize > 0) {
          await tx
            .update(clubs)
            .set({ Budget: sql`coalesce(${clubs.Budget}, 0) + ${prize}`, updatedAt: new Date() })
            .where(eq(clubs.id, clubId));
          await tx.insert(transferLedger).values({
            Type: 'prize',
            BuyerClubId: clubId,
            Amount: prize,
            Note: `${season.SeasonCode}: ${t.pool.Name} - position ${position}`,
            updatedAt: new Date(),
          });
        }
        const xp = Math.round((def.Rewards.xp.find((p) => p.position === position)?.amount ?? 0) * factor);
        if (xp > 0) await addXp(tx, clubId, xp, span.toDay, seasonId, calendar.LevelThresholds);
      }

      const winner = ranked[0]?.row.ClubId;
      if (winner) {
        await tx.insert(awards).values({
          Name: winner === champions ? (def.Rewards.trophy ?? `${t.pool.Name} champions`) : `${t.pool.Name} champions`,
          Type: 'club',
          Period: season.SeasonCode,
          Category: 'trophy',
          RecipientId: winner,
          ClubId: winner,
          SeasonId: seasonId,
          updatedAt: new Date(),
        });
      }

      for (const clubId of up) {
        promoted.push(clubId);
        await changeLevel(tx, clubId, 1, { day: span.toDay, seasonId, calendar, sinceDay: span.fromDay, source: 'promotion' });
      }
      for (const clubId of down) {
        relegated.push(clubId);
        await changeLevel(tx, clubId, -1, { day: span.toDay, seasonId, calendar, sinceDay: span.fromDay, source: 'relegation' });
      }
    }
    if (champions) {
      await tx.update(seasons).set({ WinnerId: champions, updatedAt: new Date() }).where(eq(seasons.id, seasonId));
    }
  });

  return { seasonId, champions, promoted, relegated };
}

// ---------------------------------------------------------------------------
// Year end
// ---------------------------------------------------------------------------

/** Running pyramid editions (every country's). */
async function runningPyramids() {
  const running = await db().select().from(seasons).where(eq(seasons.Status, 'running'));
  return running.filter((s) => isPyramid(s.Definition));
}

/** Finish every running pyramid edition for the year that just ended. */
export async function finishAllPyramids(span: { year: number; fromDay: number; toDay: number }) {
  const out: PyramidFinish[] = [];
  for (const s of await runningPyramids()) {
    try {
      const done = await finishPyramid(s.id, span);
      if (done) out.push(done);
    } catch (err) {
      console.error(`[pyramid] ${s.SeasonCode}: finish failed`, err);
    }
  }
  return out;
}

/** Pyramid competitions (not archived). */
export async function pyramidCompetitions() {
  const rows = await db().select().from(competitions).where(eq(competitions.Archived, false));
  return rows.filter((c) => isPyramid({ Stages: c.Stages ?? [] }));
}

/** Clubs in each placed country, for deciding which countries get a draw. */
export async function countriesWithClubs() {
  return db()
    .select({ countryId: clubs.AddressCountryId, n: sql<number>`count(*)::int` })
    .from(clubs)
    .innerJoin(places, eq(places.id, clubs.AddressCountryId))
    .where(and(isNull(clubs.ReleasedAt), eq(places.Type, 'country'), isNotNull(places.MapX)))
    .groupBy(clubs.AddressCountryId);
}

/** Remove fixtures and entries of released clubs from future rounds of
 * running pyramids (their opponents get a free day). */
export async function dropFromPyramids(clubIds: string[]) {
  if (!clubIds.length) return;
  const running = (await runningPyramids()).map((s) => s.id);
  if (!running.length) return;
  await db()
    .delete(fixtures)
    .where(
      and(
        inArray(fixtures.SeasonId, running),
        eq(fixtures.Played, false),
        or(inArray(fixtures.HomeTeamId, clubIds), inArray(fixtures.AwayTeamId, clubIds))
      )
    );
}
