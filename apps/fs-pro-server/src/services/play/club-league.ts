import { and, asc, eq, inArray, isNotNull, max, or } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, entries, fixtures, pools, seasons } from '../../db/drizzle/schema';
import { isPyramid, poolTables, pyramidStage } from '../competitions/pyramid.service';

/**
 * A club's place in its country's pyramid, as the campus HUD shows it (the
 * CoC "trophy league" badge, docs/CORE-LOOP.md): division, pool, rank, the
 * pool table and the next league fixture with a real-time countdown when the
 * world clock is live.
 */

const db = () => DrizzleDatabase.getInstance().database;

export interface LeagueRow {
  clubId: string;
  name: string;
  code: string;
  rank: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gd: number;
  points: number;
}

export interface LeagueFixture {
  fixtureId: string;
  opponentId: string;
  opponentName: string;
  opponentCode: string;
  home: boolean;
  day: number;
  kickoffHour: number;
  /** Real seconds until kickoff; null while the world clock is paused. */
  startsInSeconds: number | null;
}

export interface ClubLeague {
  editionId: string;
  competitionName: string;
  division: number;
  poolName: string;
  /** Clubs moving up / down at year end (0 = none). */
  promote: number;
  relegate: number;
  rank: number | null;
  clubsInPool: number;
  table: LeagueRow[];
  next: LeagueFixture | null;
  /** The club's last league result: "W 2-1 vs ABC". */
  last: { fixtureId: string; outcome: 'W' | 'D' | 'L'; score: string; opponentCode: string } | null;
}

const scores = (details: unknown) => {
  const d = (details ?? {}) as { HomeTeamScore?: number; AwayTeamScore?: number };
  return { home: Number(d.HomeTeamScore ?? 0), away: Number(d.AwayTeamScore ?? 0) };
};

export async function getClubLeague(clubId: string): Promise<ClubLeague | null> {
  const mine = await db()
    .select({ entry: entries, season: seasons })
    .from(entries)
    .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
    .where(and(eq(entries.ClubId, clubId), eq(seasons.Status, 'running'), isNotNull(entries.Division)));
  const found = mine.find((r) => isPyramid(r.season.Definition));
  if (!found) return null;
  const { entry, season } = found;

  const [table] = entry.Group ? await poolTables(season.id, entry.Group) : [];
  const [pool] = entry.Group ? await db().select().from(pools).where(eq(pools.id, entry.Group)) : [];

  const clubIds = table?.rows.map((r) => r.row.ClubId) ?? [];
  const names = clubIds.length
    ? await db().select({ id: clubs.id, name: clubs.Name, code: clubs.ClubCode }).from(clubs).where(inArray(clubs.id, clubIds))
    : [];
  const byId = new Map(names.map((n) => [n.id, n]));
  const rows: LeagueRow[] = (table?.rows ?? []).map((r) => ({
    clubId: r.row.ClubId,
    name: byId.get(r.row.ClubId)?.name ?? '?',
    code: byId.get(r.row.ClubId)?.code ?? '?',
    rank: r.rank,
    played: r.row.Played,
    wins: r.row.Wins,
    draws: r.row.Draws,
    losses: r.row.Losses,
    gd: r.row.GD,
    points: r.row.Points,
  }));

  const mineClause = or(eq(fixtures.HomeTeamId, clubId), eq(fixtures.AwayTeamId, clubId));
  const [nextRow] = await db()
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.SeasonId, season.id), eq(fixtures.Played, false), mineClause))
    .orderBy(asc(fixtures.ScheduledDay), asc(fixtures.KickoffHour))
    .limit(1);
  const [lastRow] = await db()
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.SeasonId, season.id), eq(fixtures.Played, true), mineClause))
    .orderBy(asc(fixtures.ScheduledDay))
    .then((r) => r.slice(-1));

  const [calendar] = await db().select().from(calendars).limit(1);
  const opponentIds = [nextRow, lastRow]
    .filter(Boolean)
    .map((f) => (f!.HomeTeamId === clubId ? f!.AwayTeamId : f!.HomeTeamId))
    .filter((id): id is string => !!id && !byId.has(id));
  if (opponentIds.length) {
    const extra = await db().select({ id: clubs.id, name: clubs.Name, code: clubs.ClubCode }).from(clubs).where(inArray(clubs.id, opponentIds));
    for (const e of extra) byId.set(e.id, e);
  }

  let next: LeagueFixture | null = null;
  if (nextRow && nextRow.ScheduledDay !== null) {
    const home = nextRow.HomeTeamId === clubId;
    const oppId = (home ? nextRow.AwayTeamId : nextRow.HomeTeamId) ?? '';
    const kickoffHour = nextRow.KickoffHour ?? calendar?.CupKickoffHour ?? 20;
    let startsInSeconds: number | null = null;
    if (calendar?.ClockMode === 'live') {
      const gameHours = (nextRow.ScheduledDay - calendar.CurrentDay) * 24 + (kickoffHour - calendar.CurrentHour);
      startsInSeconds = Math.max(0, Math.round(gameHours * ((calendar.DayLengthMinutes * 60) / 24)));
    }
    next = {
      fixtureId: nextRow.id,
      opponentId: oppId,
      opponentName: byId.get(oppId)?.name ?? '?',
      opponentCode: byId.get(oppId)?.code ?? '?',
      home,
      day: nextRow.ScheduledDay,
      kickoffHour,
      startsInSeconds,
    };
  }

  let last: ClubLeague['last'] = null;
  if (lastRow) {
    const home = lastRow.HomeTeamId === clubId;
    const s = scores(lastRow.Details);
    const yours = home ? s.home : s.away;
    const theirs = home ? s.away : s.home;
    const oppId = (home ? lastRow.AwayTeamId : lastRow.HomeTeamId) ?? '';
    last = {
      fixtureId: lastRow.id,
      outcome: yours > theirs ? 'W' : yours < theirs ? 'L' : 'D',
      score: `${yours}-${theirs}`,
      opponentCode: byId.get(oppId)?.code ?? '?',
    };
  }

  const myRow = rows.find((r) => r.clubId === clubId);
  const stage = pyramidStage(season.Definition);
  const division = entry.Division ?? 1;
  const [{ bottom }] = await db().select({ bottom: max(pools.Division) }).from(pools).where(eq(pools.SeasonId, season.id));
  return {
    editionId: season.id,
    competitionName: season.Title,
    division,
    poolName: pool?.Name ?? season.Title,
    // Mirrors finishPyramid: the top division can't go up, the bottom can't go down.
    promote: division > 1 ? (stage?.promote ?? 0) : 0,
    relegate: division < (bottom ?? 1) ? (stage?.relegate ?? 0) : 0,
    rank: myRow?.rank ?? null,
    clubsInPool: rows.length,
    table: rows,
    next,
    last,
  };
}
