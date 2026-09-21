import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { fixtures, players } from '../../db/drizzle/schema';
import { compileStandings } from '../../utils/seasons';

/** Real, checkable things the media desk can say about one club going into a match. */
export interface ClubFacts {
  code: string;
  name: string;
  /** 1-based league position; null when there is no table yet. */
  position: number | null;
  points: number;
  played: number;
  totalTeams: number;
  /** Points to the club above / from the club below (null at the extremes). */
  gapToAbove: number | null;
  gapToBelow: number | null;
  /** Most recent first, up to 5. */
  form: ('W' | 'D' | 'L')[];
  streak: { type: 'W' | 'D' | 'L'; length: number } | null;
  unbeaten: number;
  goalsForLast5: number;
  goalsAgainstLast5: number;
  topScorer: { name: string; goals: number } | null;
  /** Best-rated injured players. */
  injured: { name: string; rating: number; days: number }[];
}

export interface FixtureFacts {
  home: ClubFacts;
  away: ClubFacts;
  /** Last meeting this season between the two, from the home side's view. */
  lastMeeting: { homeGoals: number; awayGoals: number; homeCode: string } | null;
}

interface PlayedRow {
  Home: string | null;
  Away: string | null;
  PlayedAt: Date | null;
  Details: any;
  Events: any;
}

function scoreOf(f: PlayedRow): { h: number; a: number } {
  const d = f.Details ?? {};
  return {
    h: Number(d.HomeTeamScore ?? d.HomeTeamDetails?.Goals ?? 0),
    a: Number(d.AwayTeamScore ?? d.AwayTeamDetails?.Goals ?? 0),
  };
}

function resultFor(f: PlayedRow, code: string): 'W' | 'D' | 'L' {
  const { h, a } = scoreOf(f);
  const mine = f.Home === code ? h : a;
  const theirs = f.Home === code ? a : h;
  return mine > theirs ? 'W' : mine === theirs ? 'D' : 'L';
}

/**
 * Gathers the facts for one fixture from a handful of cheap queries: the
 * season's played fixtures for the two clubs (form, scorers, last meeting),
 * the compiled table (position, gaps) and injured players.
 */
export async function gatherFixtureFacts(
  db: any,
  params: {
    fixture: any;
    season: any | null;
  }
): Promise<FixtureFacts> {
  const { fixture, season } = params;
  const homeCode: string = fixture.Home;
  const awayCode: string = fixture.Away;

  const table: any[] =
    season && Array.isArray(season.Standings) && season.Standings.length
      ? compileStandings(season.Standings)
      : [];

  const played: PlayedRow[] = season
    ? await db
        .select({
          Home: fixtures.Home,
          Away: fixtures.Away,
          PlayedAt: fixtures.PlayedAt,
          Details: fixtures.Details,
          Events: fixtures.Events,
        })
        .from(fixtures)
        .where(
          and(
            eq(fixtures.SeasonId, season.id),
            eq(fixtures.Played, true),
            or(
              inArray(fixtures.Home, [homeCode, awayCode]),
              inArray(fixtures.Away, [homeCode, awayCode])
            )
          )
        )
    : [];
  played.sort(
    (a, b) => (b.PlayedAt?.getTime() ?? 0) - (a.PlayedAt?.getTime() ?? 0)
  );

  const clubRows: any[] = await db.query.clubs.findMany({
    where: (c: any, { inArray: inA }: any) => inA(c.ClubCode, [homeCode, awayCode]),
  });
  const clubByCode = new Map(clubRows.map((c) => [c.ClubCode, c]));

  const buildClub = async (code: string): Promise<ClubFacts> => {
    const club = clubByCode.get(code);
    const mine = played.filter((f) => f.Home === code || f.Away === code);
    const results = mine.map((f) => resultFor(f, code));
    const form = results.slice(0, 5);

    let streak: ClubFacts['streak'] = null;
    if (results.length) {
      let n = 0;
      while (n < results.length && results[n] === results[0]) n++;
      streak = { type: results[0], length: n };
    }
    let unbeaten = 0;
    while (unbeaten < results.length && results[unbeaten] !== 'L') unbeaten++;

    let gf = 0;
    let ga = 0;
    for (const f of mine.slice(0, 5)) {
      const { h, a } = scoreOf(f);
      gf += f.Home === code ? h : a;
      ga += f.Home === code ? a : h;
    }

    // Season top scorer from goal events (playerTeamID is the club code).
    const goalsBy = new Map<string, number>();
    for (const f of mine) {
      for (const e of Array.isArray(f.Events) ? f.Events : []) {
        if (e?.type === 'goal' && e.playerTeamID === code && e.playerID) {
          goalsBy.set(e.playerID, (goalsBy.get(e.playerID) ?? 0) + 1);
        }
      }
    }
    let topScorer: ClubFacts['topScorer'] = null;
    if (goalsBy.size) {
      const [pid, goals] = [...goalsBy.entries()].sort((a, b) => b[1] - a[1])[0];
      const p = await db.query.players.findFirst({ where: eq(players.id, pid) });
      if (p) topScorer = { name: `${p.FirstName} ${p.LastName}`, goals };
    }

    const injuredRows: any[] = club
      ? await db
          .select({
            FirstName: players.FirstName,
            LastName: players.LastName,
            Rating: players.Rating,
            Injury: players.Injury,
          })
          .from(players)
          .where(
            and(
              eq(players.ClubId, club.id),
              eq(players.isSigned, true),
              eq(players.isRetired, false),
              sql`(${players.Injury}->>'daysRemaining')::int > 0`
            )
          )
      : [];
    const injured = injuredRows
      .map((p) => ({
        name: `${p.FirstName} ${p.LastName}`,
        rating: Math.round(p.Rating ?? 0),
        days: Number(p.Injury?.daysRemaining ?? 0),
      }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 2);

    const idx = table.findIndex((r) => r.ClubCode === code);
    return {
      code,
      name: club?.Name ?? code,
      position: idx >= 0 ? idx + 1 : null,
      points: idx >= 0 ? table[idx].Points : 0,
      played: idx >= 0 ? table[idx].Played : mine.length,
      totalTeams: table.length,
      gapToAbove: idx > 0 ? table[idx - 1].Points - table[idx].Points : null,
      gapToBelow:
        idx >= 0 && idx < table.length - 1 ? table[idx].Points - table[idx + 1].Points : null,
      form,
      streak,
      unbeaten,
      goalsForLast5: gf,
      goalsAgainstLast5: ga,
      topScorer,
      injured,
    };
  };

  const [home, away] = await Promise.all([buildClub(homeCode), buildClub(awayCode)]);

  const meeting = played.find(
    (f) =>
      (f.Home === homeCode && f.Away === awayCode) ||
      (f.Home === awayCode && f.Away === homeCode)
  );
  const lastMeeting = meeting
    ? (() => {
        const { h, a } = scoreOf(meeting);
        return meeting.Home === homeCode
          ? { homeGoals: h, awayGoals: a, homeCode }
          : { homeGoals: a, awayGoals: h, homeCode };
      })()
    : null;

  return { home, away, lastMeeting };
}
