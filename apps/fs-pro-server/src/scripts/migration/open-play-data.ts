import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  CompetitionDefinition,
  StageDefinition,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  calendars,
  clubs,
  competitionClubs,
  competitions,
  entries,
  fixtures,
  rankings,
  seasonReports,
  seasons,
} from '../../db/drizzle/schema';
import { buildDefinition } from '../../services/competitions/definition';
import { levelForXp, xpForLevel } from '../../services/world/level';

/**
 * One-off conversion of scheduled-season data to open play
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Migrating existing data"). Run after
 * migrations 0027-0029. Everything happens in ONE transaction; a dry run
 * (the default) does all the work and then rolls it back, so its report is
 * exactly what `apply` would do. Safe to run again: converted competitions
 * (Stages set) and seasons (EditionNumber set) are skipped, and club XP only
 * ever goes up.
 *
 *   1. Refuse while a legacy season is part-played, unless `abandon`: then
 *      its unplayed fixtures are cancelled and the season is cancelled.
 *   2. Each competition gets a definition from its old flags: league -> one
 *      league stage ranked by points; cup -> one knockout; tournament ->
 *      groups then a knockout. Entry is invite-only with its current members
 *      invited to a new unpublished draft edition.
 *   3. Old seasons become numbered editions (by StartDate): finished ones
 *      keep their winner, their week tables become one Rankings stage, and
 *      their clubs become entries with final positions. Seasons that never
 *      started are cancelled with their unplayed fixtures.
 *   4. The world year becomes (number of old Year labels + 1), starting today.
 *   5. Club XP is seeded from the old division: division 1 = the highest
 *      seeded Level, each division below one Level lower.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];
type Competition = typeof competitions.$inferSelect;
type Season = typeof seasons.$inferSelect;

export interface MigrationOptions {
  apply: boolean;
  abandon: boolean;
}

export interface MigrationReport {
  applied: boolean;
  blockedBy: string[];
  abandonedSeasons: string[];
  competitionsConverted: { code: string; stages: string; invited: number }[];
  competitionErrors: { code: string; errors: string[] }[];
  editionsNumbered: number;
  finishedEditions: number;
  cancelledEditions: number;
  rankingRows: number;
  entriesCreated: number;
  fixturesCancelled: number;
  year: { from: number; to: number } | null;
  clubsSeeded: { clubId: string; code: string; level: number; xp: number }[];
}

class DryRun extends Error {}

const STARTED = (s: Season) =>
  s.isStarted && !s.isFinished && s.Status !== 'ended';
const FINISHED = (s: Season) =>
  s.isFinished || s.Status === 'finished' || s.Status === 'ended';

function kindOf(c: Competition): 'league' | 'cup' | 'tournament' {
  const type = c.Type?.toLowerCase();
  if (c.Cup || type === 'cup') return 'cup';
  if (c.Tournament || type === 'tournament') return 'tournament';
  return 'league';
}

/** A definition that reproduces what the old competition was. */
export function legacyDefinition(
  c: Competition
): Parameters<typeof buildDefinition>[0] {
  const kind = kindOf(c);
  const knockout: StageDefinition = {
    type: 'knockout',
    legs: 1,
    tieDays: 7,
    seeding: 'elo',
    drawAtEnd: 'penalties',
  };
  const stages: StageDefinition[] =
    kind === 'cup'
      ? [knockout]
      : kind === 'tournament'
        ? [
            {
              type: 'groups',
              days: 30,
              groupSize: 4,
              rules: { metric: 'points' },
              advance: { top: 2, perGroup: true },
            },
            { ...knockout, seeding: 'previous-stage' },
          ]
        : [
            {
              type: 'league',
              days: Math.max(30, (c.NumberOfWeeks || 0) * 3),
              rules: { metric: 'points' },
            },
          ];
  return {
    Name: c.Name,
    Prestige:
      kind === 'tournament' ? 4 : kind === 'league' && c.Division === 1 ? 3 : 2,
    Entry: {
      mode: 'invite',
      minClubs: 2,
      maxClubs: c.NumberOfTeams > 1 ? c.NumberOfTeams : null,
      ...(c.CountryId ? { countryIds: [c.CountryId] } : {}),
    },
    Stages: stages,
    Rewards: { prizeMoney: [], xp: [] },
  };
}

type StandingRow = {
  ClubID: string;
  Played: number;
  Wins: number;
  Draws: number;
  Losses: number;
  GF: number;
  GA: number;
  GD: number;
  Points: number;
};

/** Old week tables summed into one table, best first (points, GD, GF). */
export function compileLegacyStandings(standings: unknown[]): StandingRow[] {
  const total = new Map<string, StandingRow>();
  const tables = standings.flatMap((w) => {
    const table = (w as { Table?: unknown[] })?.Table;
    return Array.isArray(table) ? table : [];
  }) as Partial<StandingRow & { ClubId: string }>[];
  for (const row of tables) {
    const id = row.ClubID ?? row.ClubId;
    if (!id) continue;
    const t = total.get(id) ?? {
      ClubID: id,
      Played: 0,
      Wins: 0,
      Draws: 0,
      Losses: 0,
      GF: 0,
      GA: 0,
      GD: 0,
      Points: 0,
    };
    for (const k of [
      'Played',
      'Wins',
      'Draws',
      'Losses',
      'GF',
      'GA',
      'GD',
      'Points',
    ] as const)
      t[k] += Number(row[k] ?? 0);
    total.set(id, t);
  }
  return [...total.values()].sort(
    (a, b) => b.Points - a.Points || b.GD - a.GD || b.GF - a.GF
  );
}

async function cancelUnplayed(tx: Tx, seasonIds: string[]) {
  if (!seasonIds.length) return 0;
  const cancelled = await tx
    .update(fixtures)
    .set({
      ChallengeStatus: 'cancelled',
      ScheduledDay: null,
      ScheduledDate: null,
      updatedAt: new Date(),
    })
    .where(
      and(inArray(fixtures.SeasonId, seasonIds), eq(fixtures.Played, false))
    )
    .returning({ id: fixtures.id });
  return cancelled.length;
}

async function convertEdition(
  tx: Tx,
  season: Season,
  number: number,
  definition: CompetitionDefinition | null,
  report: MigrationReport
) {
  const finished = FINISHED(season);
  await tx
    .update(seasons)
    .set({
      EditionNumber: number,
      Status: finished ? 'finished' : 'cancelled',
      Definition: definition,
      isFinished: finished,
      updatedAt: new Date(),
    })
    .where(eq(seasons.id, season.id));
  report.editionsNumbered++;
  if (!finished) {
    report.cancelledEditions++;
    report.fixturesCancelled += await cancelUnplayed(tx, [season.id]);
    return;
  }
  report.finishedEditions++;

  // Clubs that took part: the table's clubs, else anyone in its fixtures.
  const table = compileLegacyStandings(season.Standings ?? []);
  let clubIds = table.map((r) => r.ClubID);
  if (!clubIds.length) {
    const played = await tx
      .select({ home: fixtures.HomeTeamId, away: fixtures.AwayTeamId })
      .from(fixtures)
      .where(eq(fixtures.SeasonId, season.id));
    clubIds = [
      ...new Set(
        played.flatMap((p) => [p.home, p.away]).filter((x): x is string => !!x)
      ),
    ];
  }
  const known = new Set(
    clubIds.length
      ? (
          await tx
            .select({ id: clubs.id })
            .from(clubs)
            .where(inArray(clubs.id, clubIds))
        ).map((c) => c.id)
      : []
  );
  clubIds = clubIds.filter((id) => known.has(id));

  if (table.length) {
    const rows = table.filter((r) => known.has(r.ClubID));
    if (rows.length) {
      await tx
        .insert(rankings)
        .values(
          rows.map((r) => ({
            SeasonId: season.id,
            ClubId: r.ClubID,
            StageIndex: 0,
            Played: r.Played,
            Wins: r.Wins,
            Draws: r.Draws,
            Losses: r.Losses,
            GF: r.GF,
            GA: r.GA,
            GD: r.GD,
            Points: r.Points,
            updatedAt: new Date(),
          }))
        )
        .onConflictDoNothing();
      report.rankingRows += rows.length;
    }
  }

  if (clubIds.length) {
    const position = (id: string) => {
      if (table.length) return table.findIndex((r) => r.ClubID === id) + 1;
      return id === season.WinnerId ? 1 : null;
    };
    const inserted = await tx
      .insert(entries)
      .values(
        clubIds.map((id) => ({
          SeasonId: season.id,
          ClubId: id,
          Status: 'active',
          FinalPosition: position(id),
          updatedAt: new Date(),
        }))
      )
      .onConflictDoNothing()
      .returning({ id: entries.id });
    report.entriesCreated += inserted.length;
  }
}

async function migrate(
  tx: Tx,
  options: MigrationOptions,
  report: MigrationReport
) {
  const [calendar] = await tx.select().from(calendars).limit(1);
  if (!calendar)
    throw new Error('No calendar row: the game world has not been set up');
  const legacy = await tx
    .select()
    .from(seasons)
    .where(isNull(seasons.EditionNumber));

  // 1. Part-played seasons.
  const running = legacy.filter(STARTED);
  if (running.length && !options.abandon) {
    report.blockedBy = running.map((s) => s.SeasonCode);
    return;
  }
  for (const s of running) {
    report.fixturesCancelled += await cancelUnplayed(tx, [s.id]);
    await tx
      .update(seasons)
      .set({
        isStarted: true,
        isFinished: false,
        Status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, s.id));
    s.Status = 'cancelled';
    s.isFinished = false;
    report.abandonedSeasons.push(s.SeasonCode);
  }

  // 2. Competitions.
  const all = await tx.select().from(competitions);
  const definitions = new Map<string, CompetitionDefinition>();
  for (const c of all) {
    if (c.Stages) {
      const existing = buildDefinition({
        Name: c.Name,
        Prestige: c.Prestige,
        Entry: c.Entry ?? undefined,
        Stages: c.Stages,
        WinCondition: c.WinCondition ?? undefined,
        Rewards: c.Rewards ?? undefined,
      });
      if (existing.ok) definitions.set(c.id, existing.definition);
      continue;
    }
    const built = buildDefinition(legacyDefinition(c));
    if (!built.ok) {
      report.competitionErrors.push({
        code: c.CompetitionCode,
        errors: built.errors.map((e) => `${e.path}: ${e.message}`),
      });
      continue;
    }
    const def = built.definition;
    definitions.set(c.id, def);
    await tx
      .update(competitions)
      .set({
        Prestige: def.Prestige,
        Entry: def.Entry,
        Stages: def.Stages,
        WinCondition: def.WinCondition,
        Rewards: def.Rewards,
        updatedAt: new Date(),
      })
      .where(eq(competitions.id, c.id));

    // Numbered after its old seasons (step 3 counts them first).
    const oldCount = legacy.filter((s) => s.CompetitionId === c.id).length;
    const members = await tx
      .select({ clubId: competitionClubs.ClubId })
      .from(competitionClubs)
      .where(eq(competitionClubs.CompetitionId, c.id));
    const number = oldCount + 1;
    const [draft] = await tx
      .insert(seasons)
      .values({
        SeasonCode: `${c.CompetitionCode.toUpperCase()}-E${number}`,
        Title: `${c.Name} #${number}`,
        StartDate: new Date(),
        EndDate: new Date(),
        CompetitionId: c.id,
        CompetitionCode: c.CompetitionCode,
        EditionNumber: number,
        Status: 'draft',
        RegistrationOpensDay: calendar.CurrentDay,
        RegistrationClosesDay: calendar.CurrentDay + 7,
        StartDay: calendar.CurrentDay + 7,
        updatedAt: new Date(),
      })
      .returning();
    if (members.length) {
      await tx
        .insert(entries)
        .values(
          members.map((m) => ({
            SeasonId: draft!.id,
            ClubId: m.clubId,
            Status: 'invited',
            updatedAt: new Date(),
          }))
        )
        .onConflictDoNothing();
    }
    report.competitionsConverted.push({
      code: c.CompetitionCode,
      stages: def.Stages.map((s) => s.type).join(' + '),
      invited: members.length,
    });
  }

  // 3. Old seasons -> numbered editions, per competition by StartDate.
  const byCompetition = new Map<string, Season[]>();
  for (const s of legacy) {
    const key = s.CompetitionId ?? `code:${s.CompetitionCode}`;
    byCompetition.set(key, [...(byCompetition.get(key) ?? []), s]);
  }
  for (const [key, list] of byCompetition) {
    list.sort(
      (a, b) =>
        a.StartDate.getTime() - b.StartDate.getTime() ||
        a.SeasonCode.localeCompare(b.SeasonCode)
    );
    for (const [i, s] of list.entries()) {
      await convertEdition(tx, s, i + 1, definitions.get(key) ?? null, report);
    }
  }

  // 4. The year.
  const labels = new Set(
    legacy.map((s) => s.Year).filter((y): y is string => !!y)
  );
  const [{ reports }] = await tx
    .select({ reports: sql<number>`count(*)::int` })
    .from(seasonReports)
    .where(sql`${seasonReports.Year} ~ '^Y[0-9]+$'`);
  if (labels.size && reports === 0 && calendar.CurrentYear === 1) {
    const year = labels.size + 1;
    await tx
      .update(calendars)
      .set({
        CurrentYear: year,
        YearStartDay: calendar.CurrentDay,
        updatedAt: new Date(),
      })
      .where(eq(calendars.id, calendar.id));
    report.year = { from: calendar.CurrentYear, to: year };
  }

  // 5. Club XP from the old division.
  const leagues = all.filter((c) => kindOf(c) === 'league' && c.Division > 0);
  const deepest = Math.max(0, ...leagues.map((c) => c.Division));
  const divisionOf = new Map(leagues.map((c) => [c.id, c.Division]));
  const clubRows = await tx.select().from(clubs).orderBy(asc(clubs.ClubCode));
  for (const club of clubRows) {
    const division = club.LeagueId ? divisionOf.get(club.LeagueId) : undefined;
    if (!division) continue;
    const level = deepest - division + 1;
    const xp = xpForLevel(level, calendar.LevelThresholds ?? undefined);
    if (club.XP >= xp) continue;
    await tx
      .update(clubs)
      .set({ XP: xp, updatedAt: new Date() })
      .where(eq(clubs.id, club.id));
    report.clubsSeeded.push({
      clubId: club.id,
      code: club.ClubCode,
      level: levelForXp(xp, calendar.LevelThresholds ?? undefined),
      xp,
    });
  }
}

export async function migrateOpenPlayData(
  options: MigrationOptions
): Promise<MigrationReport> {
  const report: MigrationReport = {
    applied: false,
    blockedBy: [],
    abandonedSeasons: [],
    competitionsConverted: [],
    competitionErrors: [],
    editionsNumbered: 0,
    finishedEditions: 0,
    cancelledEditions: 0,
    rankingRows: 0,
    entriesCreated: 0,
    fixturesCancelled: 0,
    year: null,
    clubsSeeded: [],
  };
  try {
    await db().transaction(async (tx) => {
      await migrate(tx, options, report);
      if (report.blockedBy.length || !options.apply) throw new DryRun();
    });
    report.applied = true;
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  return report;
}
