import { and, eq, desc, inArray } from 'drizzle-orm';
import type { MediaItem } from '@repo/api-contract';
import { fixtures, players } from '../../db/drizzle/schema';
import { compileStandings } from '../../utils/seasons';
import { pick, ord } from './story-angles.service';

/**
 * Coverage of matches that have already happened: the viewer's latest match
 * report and the latest matchweek round-up. The hub used to preview the next
 * fixture only, so once a season was under way there was nothing to read
 * about what had just been played. Purely local - no Jev.
 */

interface PlayedFixture {
  id: string;
  Home: string | null;
  Away: string | null;
  Week: number | null;
  Stadium: string | null;
  PlayedAt: Date | null;
  Details: any;
  Events: any;
  HomeTeamId: string | null;
  AwayTeamId: string | null;
}

const scoreOf = (f: PlayedFixture) => ({
  h: Number(f.Details?.HomeTeamScore ?? f.Details?.HomeTeamDetails?.Goals ?? 0),
  a: Number(f.Details?.AwayTeamScore ?? f.Details?.AwayTeamDetails?.Goals ?? 0),
});

export async function generateResultsNews(params: {
  db: any;
  season: any | null;
  club: { id: string; ClubCode: string; Name: string } | null;
  compName: string;
  formattedDate: string;
  isMyClubChannel: boolean;
}): Promise<MediaItem[]> {
  const { db, season, club, compName, formattedDate, isMyClubChannel } = params;
  if (!season) return [];

  const played: PlayedFixture[] = await db
    .select({
      id: fixtures.id,
      Home: fixtures.Home,
      Away: fixtures.Away,
      Week: fixtures.Week,
      Stadium: fixtures.Stadium,
      PlayedAt: fixtures.PlayedAt,
      Details: fixtures.Details,
      Events: fixtures.Events,
      HomeTeamId: fixtures.HomeTeamId,
      AwayTeamId: fixtures.AwayTeamId,
    })
    .from(fixtures)
    .where(and(eq(fixtures.SeasonId, season.id), eq(fixtures.Played, true)))
    .orderBy(desc(fixtures.PlayedAt));
  if (!played.length) return [];

  const table: any[] =
    Array.isArray(season.Standings) && season.Standings.length
      ? compileStandings(season.Standings)
      : [];
  const nameRows: any[] = await db.query.clubs.findMany({
    where: (c: any, { inArray: inA }: any) =>
      inA(
        c.ClubCode,
        [...new Set(played.flatMap((f) => [f.Home, f.Away]).filter(Boolean) as string[])]
      ),
  });
  const nameOf = (code: string | null) => nameRows.find((c) => c.ClubCode === code)?.Name ?? code ?? '?';

  const items: MediaItem[] = [];

  // 1. The viewer's latest match report.
  const mine = club
    ? played.find((f) => f.Home === club.ClubCode || f.Away === club.ClubCode)
    : undefined;
  if (mine && club && isMyClubChannel) {
    const { h, a } = scoreOf(mine);
    const isHome = mine.Home === club.ClubCode;
    const gf = isHome ? h : a;
    const ga = isHome ? a : h;
    const oppCode = isHome ? mine.Away : mine.Home;
    const opp = nameOf(oppCode);
    const result = gf > ga ? 'win' : gf === ga ? 'draw' : 'defeat';
    const margin = Math.abs(gf - ga);
    const total = gf + ga;

    const goalEvents = (Array.isArray(mine.Events) ? mine.Events : []).filter((e: any) => e?.type === 'goal');
    const ids = [...new Set(goalEvents.map((e: any) => e.playerID).filter(Boolean))] as string[];
    if (mine.Details?.MOTM) ids.push(mine.Details.MOTM);
    const people: any[] = ids.length
      ? await db.select({ id: players.id, F: players.FirstName, L: players.LastName }).from(players).where(inArray(players.id, ids))
      : [];
    const pname = (id: string) => {
      const p = people.find((x) => x.id === id);
      return p ? `${p.F} ${p.L}` : 'a team-mate';
    };
    const scorerText = (code: string) => {
      const mineGoals = goalEvents.filter((e: any) => e.playerTeamID === code);
      const by = new Map<string, number[]>();
      for (const e of mineGoals) by.set(e.playerID, [...(by.get(e.playerID) ?? []), e.minute]);
      return [...by.entries()].map(([id, mins]) => `${pname(id)} ${mins.map((m) => `${m}'`).join(', ')}`);
    };
    const ourScorers = scorerText(club.ClubCode);
    const theirScorers = oppCode ? scorerText(oppCode) : [];
    const motm = mine.Details?.MOTM ? pname(mine.Details.MOTM) : null;

    const pos = table.findIndex((r) => r.ClubCode === club.ClubCode);
    const row = pos >= 0 ? table[pos] : null;
    const seed = String(mine.id);
    const scoreLine = `${nameOf(mine.Home)} ${h}-${a} ${nameOf(mine.Away)}`;

    let headline: string;
    if (result === 'win') {
      headline = margin >= 3
        ? pick(seed, 'h', [`${club.Name} Rout ${opp} ${gf}-${ga}`, `Emphatic: ${club.Name} Thrash ${opp}`])
        : total >= 5
        ? pick(seed, 'h', [`Thriller: ${club.Name} Edge ${opp} ${gf}-${ga}`, `Goals Galore as ${club.Name} Beat ${opp}`])
        : pick(seed, 'h', [`${club.Name} Beat ${opp} ${gf}-${ga}`, `${club.Name} Take Three Points Against ${opp}`, `Job Done: ${club.Name} Get Past ${opp}`]);
    } else if (result === 'draw') {
      headline = gf === 0
        ? pick(seed, 'h', [`Goalless: ${club.Name} and ${opp} Cancel Out`, `${club.Name} Held to a Stalemate by ${opp}`])
        : pick(seed, 'h', [`${club.Name} Share the Spoils With ${opp}`, `${gf}-${ga}: ${club.Name} and ${opp} Split the Points`]);
    } else {
      headline = margin >= 3
        ? pick(seed, 'h', [`${club.Name} Well Beaten by ${opp}`, `Heavy Defeat for ${club.Name} Against ${opp}`])
        : pick(seed, 'h', [`${club.Name} Fall to ${opp} ${ga}-${gf}`, `${opp} Take the Points Against ${club.Name}`]);
    }

    const tableLine = row
      ? `${club.Name} are ${ord(pos + 1)} on ${row.Points} points after ${row.Played}.`
      : '';
    items.push({
      id: `result-${mine.id}`,
      type: 'news',
      category: 'matchday',
      badge: result === 'win' ? '✅ MATCH REPORT' : result === 'draw' ? '➖ MATCH REPORT' : '❌ MATCH REPORT',
      badgeColor: result === 'win' ? 'success' : result === 'draw' ? 'amber-darken-1' : 'error',
      title: headline,
      subtitle: `${scoreLine} • ${mine.Stadium ?? 'League Arena'} • ${compName}${mine.Week ? ` • Week ${mine.Week}` : ''}`,
      summary: `${scoreLine}. ${
        ourScorers.length ? `${club.Name} scorers: ${ourScorers.join('; ')}. ` : gf === 0 ? `${club.Name} could not find a goal. ` : ''
      }${theirScorers.length ? `${opp}: ${theirScorers.join('; ')}. ` : ''}${tableLine}`,
      bulletPoints: [
        `Result: ${result} (${gf}-${ga})${isHome ? ' at home' : ' away'}.`,
        ...(motm ? [`Man of the match: ${motm}.`] : []),
        ...(row ? [`Table: ${ord(pos + 1)}, ${row.Points} pts (${row.Wins}W ${row.Draws}D ${row.Losses}L, GD ${row.GD >= 0 ? '+' : ''}${row.GD}).`] : []),
      ],
      hero: {
        format: 'crest_clash',
        homeCode: mine.Home ?? undefined,
        awayCode: mine.Away ?? undefined,
        homeName: nameOf(mine.Home),
        awayName: nameOf(mine.Away),
        stadiumName: mine.Stadium ?? undefined,
        bannerTheme: result === 'win' ? 'classic_gold' : 'press_dark',
      },
      actions: [
        { label: 'Match Review', action: 'match_center', to: `/matchzone/${mine.id}`, icon: 'mdi-play', color: 'primary' },
      ],
      timestamp: formattedDate,
      hypeScore: margin >= 3 || total >= 5 ? 4 : 3,
    });
  }

  // 2. Latest matchweek round-up (whole competition).
  const latestWeek = Math.max(...played.map((f) => f.Week ?? 0));
  const weekGames = played.filter((f) => (f.Week ?? 0) === latestWeek);
  if (latestWeek > 0 && weekGames.length) {
    const biggest = [...weekGames].sort((x, y) => Math.abs(scoreOf(y).h - scoreOf(y).a) - Math.abs(scoreOf(x).h - scoreOf(x).a))[0];
    const bs = scoreOf(biggest);
    const goals = weekGames.reduce((n, f) => n + scoreOf(f).h + scoreOf(f).a, 0);
    const leader = table[0];
    const second = table[1];
    items.push({
      id: `roundup-${season.id}-${latestWeek}`,
      type: 'news',
      category: 'matchday',
      badge: '📋 MATCHWEEK ROUND-UP',
      badgeColor: 'primary',
      title: `${compName} Week ${latestWeek}: ${goals} Goals in ${weekGames.length} Matches`,
      subtitle: leader ? `${nameOf(leader.ClubCode)} lead the table on ${leader.Points} points` : undefined,
      summary: `${weekGames.length} match${weekGames.length === 1 ? '' : 'es'} produced ${goals} goals. ${
        Math.abs(bs.h - bs.a) >= 2 ? `The biggest result: ${nameOf(biggest.Home)} ${bs.h}-${bs.a} ${nameOf(biggest.Away)}. ` : ''
      }${leader && second ? `${nameOf(leader.ClubCode)} lead ${nameOf(second.ClubCode)} by ${leader.Points - second.Points} point(s).` : ''}`,
      bulletPoints: weekGames.map((f) => {
        const s = scoreOf(f);
        return `${nameOf(f.Home)} ${s.h}-${s.a} ${nameOf(f.Away)}`;
      }),
      hero: { format: 'poster', bannerTheme: 'press_dark', caption: `${compName} • Week ${latestWeek} results` },
      timestamp: formattedDate,
      hypeScore: 3,
    });
  }

  return items;
}
