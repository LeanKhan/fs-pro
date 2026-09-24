import { desc, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  fixtures,
  calendars,
  seasons,
  players,
  transferLedger,
  competitions,
} from '../../db/drizzle/schema';
import { editionStandings } from '../competitions/ranking.service';
import type { WorldFeed, WorldFeedHeadline } from '@repo/api-contract';

export class WorldFeedService {
  public static async generateWorldFeed(): Promise<WorldFeed> {
    const dz = DrizzleDatabase.getInstance();
    const db = dz.database;

    // 1. Current calendar
    const calendarRow = await db.query.calendars.findFirst();
    const currentDay = calendarRow?.CurrentDay ?? 0;
    const currentDate = calendarRow?.CurrentDate?.toISOString() ?? new Date().toISOString();

    // 2. Recent Played Fixtures (last 15)
    const recentFixtures = await db.query.fixtures.findMany({
      where: eq(fixtures.Played, true),
      orderBy: [desc(fixtures.PlayedAt), desc(fixtures.ScheduledDay)],
      limit: 15,
      with: {
        homeTeam: true,
        awayTeam: true,
      },
    });

    const recentResults = recentFixtures.map((f) => {
      const details = f.Details as any;
      const homeScore = details?.HomeTeamScore ?? details?.homeScore ?? 0;
      const awayScore = details?.AwayTeamScore ?? details?.awayScore ?? 0;
      const homeRating = f.homeTeam?.Rating ?? 60;
      const awayRating = f.awayTeam?.Rating ?? 60;

      // Upset detection: team lower by >= 5 rating won
      const isUpset =
        (homeScore > awayScore && homeRating + 5 < awayRating) ||
        (awayScore > homeScore && awayRating + 5 < homeRating);

      return {
        fixtureId: String(f.id),
        title: f.Title ?? `${f.Home} vs ${f.Away}`,
        leagueCode: f.LeagueCode ?? 'LEAGUE',
        home: f.Home ?? 'HOME',
        away: f.Away ?? 'AWAY',
        homeScore,
        awayScore,
        motm: details?.MOTM ?? null,
        day: f.ScheduledDay ?? currentDay,
        isUpset,
      };
    });

    // 3. Current Competitions & Standings Leaders
    const activeSeasons = await db.query.seasons.findMany({
      where: eq(seasons.Status, 'running'),
      limit: 6,
    });

    const allComps = await db.query.competitions.findMany({ limit: 10 });
    const otherLeagues = await Promise.all(
      activeSeasons.map(async (s) => {
        const comp = allComps.find((c) => c.id === s.CompetitionId);
        const [leader] = await editionStandings(s.id);
        return {
          id: String(s.id),
          name: s.Title ?? comp?.Name ?? s.SeasonCode,
          code: s.SeasonCode ?? 'LG',
          leader: leader?.ClubCode ?? 'TBD',
          leaderPoints: leader?.Points ?? 0,
          matchesPlayed: leader?.Played ?? 0,
        };
      })
    );

    // 4. Active Injuries across the world
    const injuredPlayers = await db.query.players.findMany({
      where: sql`"Injury" IS NOT NULL AND ("Injury"->>'daysRemaining')::int > 0`,
      limit: 10,
    });

    const activeInjuries = injuredPlayers.map((p) => {
      const inj = p.Injury as any;
      return {
        playerId: String(p.id),
        name: `${p.FirstName} ${p.LastName}`,
        club: p.ClubCode ?? 'Unsigned',
        type: inj?.type ?? 'Knock',
        daysRemaining: Number(inj?.daysRemaining ?? 0),
      };
    });

    // 5. Recent Transfers from TransferLedger
    const recentTransfers = await db.query.transferLedger.findMany({
      where: eq(transferLedger.Type, 'transfer'),
      orderBy: [desc(transferLedger.createdAt)],
      limit: 5,
      with: {
        player: true,
      },
    });

    // 6. Synthesize Dynamic World Headlines
    const headlines: WorldFeedHeadline[] = [];

    // Headline from major match results / upsets
    for (const r of recentResults.slice(0, 4)) {
      const totalGoals = r.homeScore + r.awayScore;
      if (r.isUpset) {
        const winner = r.homeScore > r.awayScore ? r.home : r.away;
        const loser = r.homeScore > r.awayScore ? r.away : r.home;
        headlines.push({
          id: `hl-upset-${r.fixtureId}`,
          category: 'result',
          title: `SHOCK DEFEAT: ${winner} stun ${loser} in ${r.leagueCode}!`,
          summary: `${winner} defied the pre-match odds to claim a famous victory with a ${r.homeScore}-${r.awayScore} scoreline on Day ${r.day}.`,
          timestamp: `Day ${r.day}`,
          tag: 'UPSET',
          relatedFixtureId: r.fixtureId,
        });
      } else if (totalGoals >= 4) {
        headlines.push({
          id: `hl-thriller-${r.fixtureId}`,
          category: 'result',
          title: `THRILLER: ${r.home} and ${r.away} share ${totalGoals} goals in sensational spectacle!`,
          summary: `Fans were treated to end-to-end football as the tie ended ${r.homeScore}-${r.awayScore}.`,
          timestamp: `Day ${r.day}`,
          tag: 'GOAL FEST',
          relatedFixtureId: r.fixtureId,
        });
      } else {
        headlines.push({
          id: `hl-match-${r.fixtureId}`,
          category: 'result',
          title: `${r.home} ${r.homeScore} - ${r.awayScore} ${r.away}: Key points contested in ${r.leagueCode}`,
          summary: `Matchday conclusion on Day ${r.day} delivers a decisive outcome at full time.`,
          timestamp: `Day ${r.day}`,
          tag: 'FULL TIME',
          relatedFixtureId: r.fixtureId,
        });
      }
    }

    // Headline from transfers
    for (const tr of recentTransfers) {
      const p = tr.player;
      if (p) {
        headlines.push({
          id: `hl-tr-${tr.id}`,
          category: 'transfer',
          title: `TRANSFER CONFIRMED: ${p.FirstName} ${p.LastName} completes transfer fee deal!`,
          summary: `Agreement finalized for a reported fee of €${(tr.Amount).toLocaleString()}. Personal terms agreed.`,
          timestamp: 'Market Wire',
          tag: 'SIGNING',
        });
      }
    }

    // Headline from injuries
    if (activeInjuries.length > 0) {
      const star = activeInjuries[0];
      headlines.push({
        id: `hl-inj-${star.playerId}`,
        category: 'injury',
        title: `INJURY BLOW: ${star.name} (${star.club}) ruled out with ${star.type}`,
        summary: `Medical staff confirm the player will miss approximately ${star.daysRemaining} days of action following an in-match injury.`,
        timestamp: `Day ${currentDay}`,
        tag: 'MEDICAL',
      });
    }

    // If few headlines, add world milestone
    if (headlines.length < 3) {
      headlines.push({
        id: 'hl-world-running',
        category: 'milestone',
        title: `GLOBAL LEAGUES IN MOTION: Matchday Calendar advances to Day ${currentDay}`,
        summary: `Clubs across all active divisions prepare for their scheduled fixtures as tournament races intensify.`,
        timestamp: `Day ${currentDay}`,
        tag: 'WORLD',
      });
    }

    return {
      currentDay,
      currentDate,
      recentResults,
      headlines,
      otherLeagues,
      activeInjuries,
    };
  }
}
