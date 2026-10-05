import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, entries, fixtures, players, pools, seasons, transferLedger } from '../../db/drizzle/schema';
import { editionStandings, getStageTable } from '../competitions/ranking.service';
import { readFeed, type NewsItemView, type Scope } from './news-scope.service';
import type { WorldFeed, WorldFeedHeadline } from '@repo/api-contract';

/**
 * The news a reader sees (docs/WORLD-PYRAMID-SPEC.md, "News scopes"):
 * stories from their club's town, region and country plus the world's
 * biggest (news-scope.service.ts), recent results and injuries from their
 * country, and the tables that matter to them (their pool, their country's
 * top division, the cups). Without a club it's the world's view. Every
 * query here is bounded by the reader's country or a small limit, so the
 * feed costs the same in a world of 10 clubs or 10,000.
 */

const SCOPE_TAG: Record<Scope, string> = { town: 'TOWN', region: 'REGION', country: 'NATIONAL', world: 'WORLD' };

function category(kind: string): WorldFeedHeadline['category'] {
  if (kind === 'transfer') return 'transfer';
  if (kind === 'founded' || kind === 'title' || kind === 'promotion' || kind === 'relegation') return 'milestone';
  return 'result';
}

function toHeadline(item: NewsItemView): WorldFeedHeadline {
  return {
    id: `news-${item.storyId}`,
    category: category(item.kind),
    title: item.title,
    summary: item.body,
    timestamp: `Day ${item.day}`,
    tag: SCOPE_TAG[item.scope],
    ...(item.fixtureId ? { relatedFixtureId: item.fixtureId } : {}),
  };
}

export class WorldFeedService {
  public static async generateWorldFeed(viewerClubId?: string | null): Promise<WorldFeed> {
    const db = DrizzleDatabase.getInstance().database;

    const [calendarRow] = await db.select().from(calendars).limit(1);
    const currentDay = calendarRow?.CurrentDay ?? 0;
    const currentDate = calendarRow?.CurrentDate?.toISOString() ?? new Date().toISOString();

    // 1. Local news first.
    const feed = await readFeed(viewerClubId, { limit: 20 });
    const headlines = feed.items.map(toHeadline);
    const countryId = feed.scopes.where.country;

    // 2. Recent results in the reader's country (the world's without one).
    const home = alias(clubs, 'home_club');
    const away = alias(clubs, 'away_club');
    const recent = await db
      .select({ f: fixtures, home: home.Name, away: away.Name, homeRating: home.Rating, awayRating: away.Rating })
      .from(fixtures)
      .innerJoin(home, eq(home.id, fixtures.HomeTeamId))
      .innerJoin(away, eq(away.id, fixtures.AwayTeamId))
      .where(and(eq(fixtures.Played, true), countryId ? eq(home.AddressCountryId, countryId) : undefined))
      .orderBy(desc(fixtures.PlayedAt))
      .limit(15);
    const recentResults = recent.map(({ f, home: h, away: a, homeRating, awayRating }) => {
      const details = f.Details as { HomeTeamScore?: number; AwayTeamScore?: number; MOTM?: string } | null;
      const homeScore = details?.HomeTeamScore ?? 0;
      const awayScore = details?.AwayTeamScore ?? 0;
      const isUpset =
        (homeScore > awayScore && homeRating + 5 < awayRating) || (awayScore > homeScore && awayRating + 5 < homeRating);
      const title = f.Title ?? '';
      return {
        fixtureId: f.id,
        title: title || `${h} vs ${a}`,
        leagueCode: f.LeagueCode ? f.LeagueCode : title.endsWith('(Matchmade)') ? 'a challenge match' : 'a friendly',
        home: h,
        away: a,
        homeScore,
        awayScore,
        motm: details?.MOTM ?? null,
        day: f.ScheduledDay ?? currentDay,
        isUpset,
      };
    });

    // 3. Tables that matter: the reader's pool, their country's top
    // division, then the cups and events running.
    const otherLeagues: WorldFeed['otherLeagues'] = [];
    if (viewerClubId) {
      const [mine] = await db
        .select({ seasonId: entries.SeasonId, group: entries.Group, name: pools.Name })
        .from(entries)
        .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
        .innerJoin(pools, sql`${pools.id}::text = ${entries.Group}`)
        .where(and(eq(entries.ClubId, viewerClubId), eq(seasons.Status, 'running')))
        .limit(1);
      if (mine?.group) {
        const table = await getStageTable(mine.seasonId, 0, mine.group);
        const leader = table.groups[0]?.rows[0];
        const [club] = leader ? await db.select({ code: clubs.ClubCode }).from(clubs).where(eq(clubs.id, leader.row.ClubId)) : [];
        otherLeagues.push({
          id: mine.group,
          name: mine.name,
          code: 'POOL',
          leader: club?.code ?? 'TBD',
          leaderPoints: leader?.row.Points ?? 0,
          matchesPlayed: leader?.row.Played ?? 0,
        });
      }
    }
    const running = await db
      .select({ id: seasons.id, title: seasons.Title, code: seasons.SeasonCode, definition: seasons.Definition })
      .from(seasons)
      .where(eq(seasons.Status, 'running'))
      .limit(60);
    const relevant = running
      .filter((s) => {
        const ids = s.definition?.Entry?.countryIds;
        return !ids?.length || !countryId || ids.includes(countryId);
      })
      .sort((a, b) => Number(b.definition?.Stages?.[0]?.type === 'pyramid') - Number(a.definition?.Stages?.[0]?.type === 'pyramid'))
      .slice(0, 6 - otherLeagues.length);
    for (const s of relevant) {
      const [leader] = await editionStandings(s.id);
      otherLeagues.push({
        id: s.id,
        name: s.title,
        code: s.code,
        leader: leader?.ClubCode ?? 'TBD',
        leaderPoints: leader?.Points ?? 0,
        matchesPlayed: leader?.Played ?? 0,
      });
    }

    // 4. Injuries in the reader's country.
    const injured = await db
      .select({ p: players })
      .from(players)
      .innerJoin(clubs, eq(clubs.id, players.ClubId))
      .where(
        and(
          sql`${players.Injury} IS NOT NULL AND (${players.Injury}->>'daysRemaining')::int > 0`,
          countryId ? eq(clubs.AddressCountryId, countryId) : undefined
        )
      )
      .limit(10);
    const activeInjuries = injured.map(({ p }) => {
      const inj = p.Injury as { type?: string; daysRemaining?: number } | null;
      return {
        playerId: p.id,
        name: `${p.FirstName} ${p.LastName}`,
        club: p.ClubCode ?? 'Unsigned',
        type: inj?.type ?? 'Knock',
        daysRemaining: Number(inj?.daysRemaining ?? 0),
      };
    });

    // 5. Transfers in the reader's country, when the news is quiet.
    if (headlines.length < 8) {
      const transfers = await db
        .select({ t: transferLedger, first: players.FirstName, last: players.LastName })
        .from(transferLedger)
        .innerJoin(players, eq(players.id, transferLedger.PlayerId))
        .innerJoin(clubs, eq(clubs.id, transferLedger.BuyerClubId))
        .where(and(eq(transferLedger.Type, 'transfer'), isNotNull(transferLedger.PlayerId), countryId ? eq(clubs.AddressCountryId, countryId) : undefined))
        .orderBy(desc(transferLedger.createdAt))
        .limit(3);
      for (const { t, first, last } of transfers) {
        headlines.push({
          id: `hl-tr-${t.id}`,
          category: 'transfer',
          title: `Signed: ${first} ${last}`,
          summary: `A deal worth ${Math.round(t.Amount).toLocaleString('en-US')} is done.`,
          timestamp: 'Market wire',
          tag: 'SIGNING',
        });
      }
    }

    if (!headlines.length) {
      headlines.push({
        id: 'hl-world-running',
        category: 'milestone',
        title: `Day ${currentDay}: the season rolls on`,
        summary: 'No news from your area yet. Results, derbies and new clubs nearby will show up here.',
        timestamp: `Day ${currentDay}`,
        tag: SCOPE_TAG[feed.scopes.local],
      });
    }

    return {
      currentDay,
      currentDate,
      recentResults,
      headlines,
      otherLeagues,
      activeInjuries,
      local: {
        scope: feed.scopes.local,
        name: feed.scopes.localName,
        townId: feed.scopes.where.town,
        regionId: feed.scopes.where.region,
        countryId: feed.scopes.where.country,
      },
    };
  }
}

/** Ids of the running editions a club is entered in (for its realtime
 * subscriptions). */
export async function runningEditionsOf(clubId: string) {
  const rows = await DrizzleDatabase.getInstance()
    .database.select({ id: entries.SeasonId })
    .from(entries)
    .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
    .where(and(eq(entries.ClubId, clubId), inArray(seasons.Status, ['registration', 'running'])));
  return rows.map((r) => r.id);
}
