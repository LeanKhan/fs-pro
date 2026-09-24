import { and, eq, inArray } from 'drizzle-orm';
import type { CompetitionDefinition, LeagueRules } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  calendars,
  clubMatchDetails,
  clubs,
  competitions,
  entries,
  fixtures,
  levelHistory,
  rankingResults,
  rankings,
  seasons,
} from '../../db/drizzle/schema';
import { levelForXp } from '../world/level';
import {
  DEFAULT_LEAGUE_RULES,
  DEFAULT_XP_PER_MATCH,
  resolveLeagueRules,
} from './definition';
import {
  applyMatchToRow,
  eloAfter,
  FORFEIT_GOALS,
  rankRows,
  reachedTarget,
  type RankedRow,
  type RankingRow,
} from './ranking';

/**
 * Turns open-play results into Rankings rows, Elo and XP
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Result writing"). Every result is
 * applied at most once: the fixture's RankingResults row is inserted in the
 * same transaction, and a conflict means it was already applied.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

export type ApplyResult =
  | { status: 'not-competition' }
  | { status: 'not-played' }
  | { status: 'already-applied' }
  | {
      status: 'applied';
      seasonId: string;
      stageIndex: number;
      /** Club that reached a first-to target with this result, if any. */
      firstToReachedBy: string | null;
    };

export interface ApplyOptions {
  /** Record the match as a forfeit by this club: it loses 0-3. */
  forfeitedBy?: string;
}

/** The edition's definition: its publish-time snapshot, else the competition's. */
function definitionOf(
  season: typeof seasons.$inferSelect,
  competition: typeof competitions.$inferSelect | undefined
): Partial<CompetitionDefinition> {
  if (season.Definition) return season.Definition;
  if (!competition) return {};
  return {
    Stages: competition.Stages ?? undefined,
    WinCondition: competition.WinCondition ?? undefined,
    Rewards: competition.Rewards ?? undefined,
  };
}

/** League rules for a stage; knockouts use the defaults for their table. */
function stageRules(
  definition: Partial<CompetitionDefinition>,
  stageIndex: number,
  worldDefaults: Partial<LeagueRules> | null
): LeagueRules {
  const stage = definition.Stages?.[stageIndex];
  if (!stage || stage.type === 'knockout') {
    return { ...DEFAULT_LEAGUE_RULES, ...worldDefaults };
  }
  return resolveLeagueRules(stage, worldDefaults);
}

async function ensureRow(
  tx: Tx,
  seasonId: string,
  stageIndex: number,
  clubId: string,
  elo: number
): Promise<typeof rankings.$inferSelect> {
  const [existing] = await tx
    .select()
    .from(rankings)
    .where(
      and(
        eq(rankings.SeasonId, seasonId),
        eq(rankings.StageIndex, stageIndex),
        eq(rankings.ClubId, clubId)
      )
    );
  if (existing) return existing;

  // Rows are normally created when the stage opens; this is the fallback.
  const [entry] = await tx
    .select({ Group: entries.Group })
    .from(entries)
    .where(and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, clubId)));
  const [created] = await tx
    .insert(rankings)
    .values({
      SeasonId: seasonId,
      StageIndex: stageIndex,
      ClubId: clubId,
      Group: entry?.Group ?? null,
      EloStart: elo,
      updatedAt: new Date(),
    })
    .returning();
  return created!;
}

async function grantXp(
  tx: Tx,
  club: { id: string; XP: number },
  amount: number,
  day: number,
  seasonId: string,
  thresholds: number[] | undefined
) {
  if (amount <= 0) return;
  const before = club.XP;
  const after = before + amount;
  await tx
    .update(clubs)
    .set({ XP: after, updatedAt: new Date() })
    .where(eq(clubs.id, club.id));

  const fromLevel = levelForXp(before, thresholds);
  const toLevel = levelForXp(after, thresholds);
  if (toLevel !== fromLevel) {
    await tx.insert(levelHistory).values({
      ClubId: club.id,
      Day: day,
      FromLevel: fromLevel,
      ToLevel: toLevel,
      XPBefore: before,
      XPAfter: after,
      Source: 'xp',
      SeasonId: seasonId,
    });
  }
}

export async function applyResult(
  fixtureId: string,
  options: ApplyOptions = {}
): Promise<ApplyResult> {
  return db().transaction(async (tx) => {
    const [fixture] = await tx
      .select()
      .from(fixtures)
      .where(eq(fixtures.id, fixtureId));
    if (
      !fixture?.CompetitionId ||
      !fixture.SeasonId ||
      !fixture.HomeTeamId ||
      !fixture.AwayTeamId
    ) {
      return { status: 'not-competition' };
    }
    if (!fixture.Played && !options.forfeitedBy)
      return { status: 'not-played' };

    const [ledger] = await tx
      .insert(rankingResults)
      .values({ FixtureId: fixture.id, SeasonId: fixture.SeasonId })
      .onConflictDoNothing()
      .returning();
    if (!ledger) return { status: 'already-applied' };

    if (fixture.ChallengeStatus === 'accepted') {
      await tx
        .update(fixtures)
        .set({ ChallengeStatus: 'played', updatedAt: new Date() })
        .where(eq(fixtures.id, fixture.id));
    }

    const homeId = fixture.HomeTeamId;
    const awayId = fixture.AwayTeamId;
    const stageIndex = fixture.StageIndex ?? 0;

    let homeGoals: number;
    let awayGoals: number;
    if (options.forfeitedBy) {
      homeGoals = options.forfeitedBy === homeId ? 0 : FORFEIT_GOALS;
      awayGoals = options.forfeitedBy === awayId ? 0 : FORFEIT_GOALS;
    } else {
      const sideIds = [
        fixture.HomeSideDetailsId,
        fixture.AwaySideDetailsId,
      ].filter((id): id is string => !!id);
      const sides = sideIds.length
        ? await tx
            .select()
            .from(clubMatchDetails)
            .where(inArray(clubMatchDetails.id, sideIds))
        : [];
      homeGoals =
        sides.find((s) => s.id === fixture.HomeSideDetailsId)?.Goals ?? 0;
      awayGoals =
        sides.find((s) => s.id === fixture.AwaySideDetailsId)?.Goals ?? 0;
    }

    const [season] = await tx
      .select()
      .from(seasons)
      .where(eq(seasons.id, fixture.SeasonId));
    const [competition] = await tx
      .select()
      .from(competitions)
      .where(eq(competitions.id, fixture.CompetitionId));
    const [calendar] = await tx.select().from(calendars).limit(1);
    const definition = definitionOf(season!, competition);
    const rules = stageRules(
      definition,
      stageIndex,
      calendar?.DefaultRules ?? null
    );

    // Lock both clubs (in id order, so two results can't deadlock) before
    // reading their rows: results sharing a club are applied one at a time,
    // so neither overwrites the other's Rankings, Elo or XP update.
    const clubRows = await tx
      .select({ id: clubs.id, Elo: clubs.Elo, XP: clubs.XP })
      .from(clubs)
      .where(inArray(clubs.id, [homeId, awayId]))
      .orderBy(clubs.id)
      .for('update');
    const home = clubRows.find((c) => c.id === homeId)!;
    const away = clubRows.find((c) => c.id === awayId)!;

    // Table rows.
    const day = fixture.ScheduledDay ?? calendar?.CurrentDay ?? 0;
    const homeRow = await ensureRow(
      tx,
      fixture.SeasonId,
      stageIndex,
      homeId,
      home.Elo
    );
    const awayRow = await ensureRow(
      tx,
      fixture.SeasonId,
      stageIndex,
      awayId,
      away.Elo
    );
    const nextHome = applyMatchToRow(homeRow, homeGoals, awayGoals, rules, {
      forfeited: options.forfeitedBy === homeId,
    });
    const nextAway = applyMatchToRow(awayRow, awayGoals, homeGoals, rules, {
      forfeited: options.forfeitedBy === awayId,
    });
    for (const row of [nextHome, nextAway]) {
      await tx
        .update(rankings)
        .set({
          Played: row.Played,
          Wins: row.Wins,
          Draws: row.Draws,
          Losses: row.Losses,
          GF: row.GF,
          GA: row.GA,
          GD: row.GD,
          Points: row.Points,
          CleanSheets: row.CleanSheets,
          Forfeits: row.Forfeits,
          UnbeatenRun: row.UnbeatenRun,
          BestUnbeatenRun: row.BestUnbeatenRun,
          LastPlayedDay: day,
          updatedAt: new Date(),
        })
        .where(eq(rankings.id, row.id));
    }

    // Elo.
    const score = homeGoals > awayGoals ? 1 : homeGoals === awayGoals ? 0.5 : 0;
    const elo = eloAfter(home.Elo, away.Elo, score);
    await tx
      .update(clubs)
      .set({ Elo: elo.home, updatedAt: new Date() })
      .where(eq(clubs.id, homeId));
    await tx
      .update(clubs)
      .set({ Elo: elo.away, updatedAt: new Date() })
      .where(eq(clubs.id, awayId));

    // XP per match.
    const xpPerMatch =
      definition.Rewards?.xpPerMatch ??
      calendar?.XPPerMatch ??
      DEFAULT_XP_PER_MATCH;
    const xpFor = (goalsFor: number, goalsAgainst: number) =>
      goalsFor > goalsAgainst
        ? xpPerMatch.win
        : goalsFor === goalsAgainst
          ? xpPerMatch.draw
          : xpPerMatch.loss;
    const thresholds = calendar?.LevelThresholds ?? undefined;
    await grantXp(
      tx,
      home,
      xpFor(homeGoals, awayGoals),
      day,
      fixture.SeasonId,
      thresholds
    );
    await grantXp(
      tx,
      away,
      xpFor(awayGoals, homeGoals),
      day,
      fixture.SeasonId,
      thresholds
    );

    // First-to win condition: report it; ending the edition is the lifecycle's job.
    let firstToReachedBy: string | null = null;
    const win = definition.WinCondition;
    if (win?.type === 'first-to') {
      const hit = [nextHome, nextAway].filter((r) =>
        reachedTarget(r, win.metric, win.target)
      );
      if (hit.length === 1) firstToReachedBy = hit[0]!.ClubId;
      else if (hit.length === 2) {
        // Both got there on the same result: the stage order decides.
        firstToReachedBy = rankRows(hit, { ...rules, minGamesToRank: 0 })[0]!
          .row.ClubId;
      }
    }

    return {
      status: 'applied',
      seasonId: fixture.SeasonId,
      stageIndex,
      firstToReachedBy,
    };
  });
}

export interface StageTable {
  seasonId: string;
  stageIndex: number;
  rules: LeagueRules;
  groups: {
    group: string | null;
    rows: RankedRow<RankingRow & { id: string }>[];
  }[];
}

/** A stage's table(s), ordered into Ranks, one list per group. */
export async function getStageTable(
  seasonId: string,
  stageIndex: number
): Promise<StageTable> {
  const [season] = await db()
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  if (!season) throw new Error(`Edition ${seasonId} not found`);
  const [competition] = season.CompetitionId
    ? await db()
        .select()
        .from(competitions)
        .where(eq(competitions.id, season.CompetitionId))
    : [];
  const [calendar] = await db().select().from(calendars).limit(1);
  const rules = stageRules(
    definitionOf(season, competition),
    stageIndex,
    calendar?.DefaultRules ?? null
  );

  const rows = await db()
    .select()
    .from(rankings)
    .where(
      and(eq(rankings.SeasonId, seasonId), eq(rankings.StageIndex, stageIndex))
    );
  const clubIds = rows.map((r) => r.ClubId);
  const elos = clubIds.length
    ? await db()
        .select({ id: clubs.id, Elo: clubs.Elo })
        .from(clubs)
        .where(inArray(clubs.id, clubIds))
    : [];
  const currentElo = Object.fromEntries(elos.map((c) => [c.id, c.Elo]));

  const byGroup = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const list = byGroup.get(row.Group) ?? [];
    list.push(row);
    byGroup.set(row.Group, list);
  }
  const groups = [...byGroup.entries()]
    .sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''))
    .map(([group, list]) => ({
      group,
      rows: rankRows(list, rules, currentElo),
    }));

  return { seasonId, stageIndex, rules, groups };
}

/** Zeroed rows for every active entry when a league/groups stage opens. */
export async function initStageRows(
  seasonId: string,
  stageIndex: number
): Promise<number> {
  const active = await db()
    .select({ ClubId: entries.ClubId, Group: entries.Group, Elo: clubs.Elo })
    .from(entries)
    .innerJoin(clubs, eq(clubs.id, entries.ClubId))
    .where(and(eq(entries.SeasonId, seasonId), eq(entries.Status, 'active')));
  if (!active.length) return 0;
  const inserted = await db()
    .insert(rankings)
    .values(
      active.map((e) => ({
        SeasonId: seasonId,
        StageIndex: stageIndex,
        ClubId: e.ClubId,
        Group: e.Group,
        EloStart: e.Elo,
        updatedAt: new Date(),
      }))
    )
    .onConflictDoNothing()
    .returning({ id: rankings.id });
  return inserted.length;
}

export const RankingService = { applyResult, getStageTable, initStageRows };
