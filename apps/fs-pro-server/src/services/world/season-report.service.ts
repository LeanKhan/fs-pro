import { and, between, desc, eq, inArray } from 'drizzle-orm';
import { getTierInfo, planMoves } from '../competitions/pyramid.service';
import type { SeasonReport, SeasonHighlight } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  clubs as clubsTable,
  competitions as competitionsTable,
  levelHistory,
  players,
  seasonReports,
  seasons as seasonsTable,
} from '../../db/drizzle/schema';
import { getSeasons } from '../../controllers/seasons/season.service';
import { getCompetitions } from '../../controllers/competitions/competition.service';
import { getClubs } from '../../controllers/clubs/club.service';
import type { RetiredPlayerSummary } from '../../controllers/players/player-lifecycle.service';

type Competition = SeasonReport['competitions'][number];
type Movement = SeasonReport['movements'][number];
type Breakout = SeasonReport['breakouts'][number];
type ReportBody = Omit<SeasonReport, 'highlights'>;

/** A rating gain this big is worth a mention even without a breakout roll. */
const BREAKOUT_MIN_DELTA = 5;
/** ...and a rolled breakout year needs at least this much to be visible. */
const FLAGGED_BREAKOUT_MIN_DELTA = 3;
const MAX_BREAKOUTS = 10;

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

/**
 * Picks the events worth telling the user about and ranks them. Pure and
 * deterministic (same data -> same headlines) so it is easy to test, and so
 * an LLM narrator can later sit on top of this list without changing what
 * gets chosen.
 */
export function deriveHighlights(report: ReportBody): SeasonHighlight[] {
  const highlights: SeasonHighlight[] = [];

  for (const c of report.competitions) {
    if (!c.championName) continue;
    const type =
      c.kind === 'continental'
        ? 'continental-winner'
        : c.kind === 'cup'
          ? 'cup-winner'
          : 'champion';
    const importance =
      c.kind === 'continental' ? 92 : c.kind === 'cup' ? 76 : c.division === 1 ? 86 : 68;
    highlights.push({
      id: `${type}:${c.code}`,
      type,
      importance,
      title: `${c.championName} win the ${c.name}`,
      detail:
        c.kind === 'league'
          ? `${c.championName} finish top of ${c.name}.`
          : `${c.championName} lift the ${c.name}.`,
      clubCode: c.championCode,
    });
  }

  const championIds = new Set(
    report.competitions.map((c) => c.championId).filter(Boolean)
  );
  for (const m of report.movements) {
    const isChampion = championIds.has(m.clubId);
    highlights.push({
      id: `${m.direction}:${m.clubCode}`,
      type: m.direction === 'promoted' ? 'promotion' : 'relegation',
      importance: m.direction === 'promoted' ? (isChampion ? 66 : 58) : 60,
      title:
        m.direction === 'promoted'
          ? `${m.clubName} promoted to ${m.to}`
          : `${m.clubName} relegated to ${m.to}`,
      detail: `${m.clubName} move from ${m.from} to ${m.to}.`,
      clubCode: m.clubCode,
    });
  }

  for (const r of report.retirements) {
    const rating = r.rating ?? 0;
    // Established quality and long careers make a retirement newsworthy.
    const importance = clamp(30 + Math.max(0, rating - 55) * 1.6 + ((r.age ?? 0) >= 38 ? 6 : 0), 0, 85);
    highlights.push({
      id: `retirement:${r.playerId}`,
      type: 'retirement',
      importance: Math.round(importance),
      title: `${r.name} retires`,
      detail: [
        r.age != null ? `Age ${r.age}` : null,
        r.position,
        r.clubCode ? `last club ${r.clubCode}` : null,
        r.rating != null ? `final rating ${Math.round(r.rating)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      clubCode: r.clubCode,
      playerId: r.playerId,
    });
  }

  for (const b of report.breakouts) {
    const young = (b.age ?? 99) <= 22;
    const importance = clamp(48 + b.delta * 3 + (young ? 10 : 0) + (b.breakoutYear ? 8 : 0), 0, 95);
    highlights.push({
      id: `breakout:${b.playerId}`,
      type: 'breakout',
      importance: Math.round(importance),
      title: `${b.name} breaks out`,
      detail: `${b.oldRating.toFixed(0)} → ${b.newRating.toFixed(0)} (+${b.delta.toFixed(0)})${
        b.age != null ? ` at ${b.age}` : ''
      }${b.clubCode ? `, ${b.clubCode}` : ''}.`,
      clubCode: b.clubCode,
      playerId: b.playerId,
    });
  }

  return highlights.sort((a, b) => b.importance - a.importance);
}

/** Players whose rating jumped this cycle, read from the RatingsHistory entry
 * updateAllPlayerDetailsForYear wrote for `year`. */
async function findBreakouts(year: string): Promise<Breakout[]> {
  const db = DrizzleDatabase.getInstance().database;
  const rows = await db
    .select({
      id: players.id,
      FirstName: players.FirstName,
      LastName: players.LastName,
      Age: players.Age,
      Position: players.Position,
      ClubCode: players.ClubCode,
      RatingsHistory: players.RatingsHistory,
    })
    .from(players)
    .where(eq(players.isRetired, false));

  const breakouts: Breakout[] = [];
  for (const row of rows) {
    const entry = [...(row.RatingsHistory ?? [])]
      .reverse()
      .find((h) => (h as { year?: string }).year === year) as
      | { rating?: number; old_rating?: number; breakout?: boolean }
      | undefined;
    if (!entry || entry.rating == null || entry.old_rating == null) continue;

    const delta = entry.rating - entry.old_rating;
    const flagged = entry.breakout === true;
    if (delta < (flagged ? FLAGGED_BREAKOUT_MIN_DELTA : BREAKOUT_MIN_DELTA)) continue;

    breakouts.push({
      playerId: row.id,
      name: `${row.FirstName} ${row.LastName}`,
      age: row.Age,
      position: row.Position,
      clubCode: row.ClubCode,
      oldRating: entry.old_rating,
      newRating: entry.rating,
      delta,
      breakoutYear: flagged,
    });
  }

  return breakouts.sort((a, b) => b.delta - a.delta).slice(0, MAX_BREAKOUTS);
}

/**
 * Snapshots what changed in season cycle `year` - champions, league
 * movement, retirements, breakout players - ranks the highlights, and stores
 * the report (replacing any earlier one for that year). Call it once the
 * cycle's player/club updates have run, since breakouts are read from the
 * ratings those updates wrote.
 */
export async function generateSeasonReport(
  year: string,
  context: { retired: RetiredPlayerSummary[] }
): Promise<SeasonReport> {
  const [seasons, competitions, clubs] = await Promise.all([
    getSeasons({ Year: year }),
    getCompetitions(),
    getClubs(),
  ]);

  const clubById = new Map(clubs.map((c) => [c._id as string, c]));
  const competitionById = new Map(competitions.map((c) => [c._id as string, c]));

  const competitionEntries: Competition[] = [];
  const movements: Movement[] = [];

  for (const season of seasons) {
    const competition = competitionById.get(season.CompetitionId ?? '');
    if (!competition) continue;

    const kind =
      competition.Type?.toLowerCase() === 'tournament'
        ? 'continental'
        : competition.Type?.toLowerCase() === 'cup'
          ? 'cup'
          : 'league';
    const champion = season.WinnerId ? clubById.get(season.WinnerId) : undefined;

    competitionEntries.push({
      code: competition.CompetitionCode,
      name: competition.Name,
      kind,
      division: competition.Division ?? 0,
      championId: season.WinnerId ?? null,
      championName: champion?.Name ?? null,
      championCode: champion?.ClubCode ?? null,
    });

    if (kind !== 'league') continue;

    // Pyramid leagues: destinations come from the same planner prolegate uses.
    const tierInfo = season.CompetitionId ? await getTierInfo(season.CompetitionId) : null;
    if (tierInfo) {
      const planned = await planMoves(tierInfo, season.Promoted ?? [], season.Relegated ?? []);
      for (const m of planned) {
        const club = clubById.get(m.clubId);
        if (!club) continue;
        movements.push({
          clubId: m.clubId,
          clubName: club.Name,
          clubCode: club.ClubCode,
          direction: m.direction,
          from: competition.CompetitionCode,
          to: m.to?.code ?? '?',
        });
      }
      continue;
    }

    // Legacy rule prolegate uses: the league one division up/down, same country.
    const moved: [string[], 'promoted' | 'relegated', number][] = [
      [season.Promoted ?? [], 'promoted', -1],
      [season.Relegated ?? [], 'relegated', 1],
    ];
    for (const [clubIds, direction, step] of moved) {
      const target = competitions.find(
        (c) =>
          c.CountryId === competition.CountryId &&
          c.Division === (competition.Division ?? 0) + step
      );
      for (const clubId of clubIds) {
        const club = clubById.get(clubId);
        if (!club) continue;
        movements.push({
          clubId,
          clubName: club.Name,
          clubCode: club.ClubCode,
          direction,
          from: competition.CompetitionCode,
          to: target?.CompetitionCode ?? '?',
        });
      }
    }
  }

  const body: ReportBody = {
    year,
    generatedAt: new Date().toISOString(),
    competitions: competitionEntries.sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.division - b.division
    ),
    movements,
    retirements: context.retired,
    breakouts: await findBreakouts(year),
  };
  const report: SeasonReport = { ...body, highlights: deriveHighlights(body) };

  const db = DrizzleDatabase.getInstance().database;
  await db
    .insert(seasonReports)
    .values({ Year: year, Data: report as unknown as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: seasonReports.Year,
      set: { Data: report as unknown as Record<string, unknown>, updatedAt: new Date() },
    });

  return report;
}

/**
 * The report for one open-play year (docs/OPEN-PLAY-COMPETITIONS-SPEC.md,
 * "Year"): every edition that finished in the year's days with its winner,
 * every promotion/relegation (Level change) in those days, retirements and
 * breakout players. Stored under `label` (e.g. "Y3").
 */
export async function generateYearReport(
  label: string,
  range: { fromDay: number; toDay: number },
  context: { retired: RetiredPlayerSummary[] }
): Promise<SeasonReport> {
  const db = DrizzleDatabase.getInstance().database;
  const finished = await db
    .select({
      season: seasonsTable,
      competition: competitionsTable,
      champion: clubsTable,
    })
    .from(seasonsTable)
    .innerJoin(competitionsTable, eq(competitionsTable.id, seasonsTable.CompetitionId))
    .leftJoin(clubsTable, eq(clubsTable.id, seasonsTable.WinnerId))
    .where(
      and(
        eq(seasonsTable.Status, 'finished'),
        between(seasonsTable.EndDay, range.fromDay, range.toDay)
      )
    );

  const competitionEntries: Competition[] = finished.map(({ season, competition, champion }) => {
    const stages = season.Definition?.Stages ?? [];
    const kind = stages.every((st) => st.type === 'knockout')
      ? 'cup'
      : stages.some((st) => st.type === 'groups')
        ? 'continental'
        : 'league';
    return {
      code: season.SeasonCode,
      name: competition.Name,
      kind,
      division: 0,
      championId: season.WinnerId ?? null,
      championName: champion?.Name ?? null,
      championCode: champion?.ClubCode ?? null,
    };
  });

  // Promotions and relegations only; Level ups from earned XP aren't news here.
  const moves = await db
    .select({ move: levelHistory, club: clubsTable })
    .from(levelHistory)
    .innerJoin(clubsTable, eq(clubsTable.id, levelHistory.ClubId))
    .where(
      and(
        between(levelHistory.Day, range.fromDay, range.toDay),
        inArray(levelHistory.Source, ['promotion', 'relegation'])
      )
    )
    .orderBy(levelHistory.Day);
  const movements: Movement[] = moves.map(({ move, club }) => ({
    clubId: club.id,
    clubName: club.Name,
    clubCode: club.ClubCode,
    direction: move.Source === 'promotion' ? 'promoted' : 'relegated',
    from: `Level ${move.FromLevel}`,
    to: `Level ${move.ToLevel}`,
  }));

  const body: ReportBody = {
    year: label,
    generatedAt: new Date().toISOString(),
    competitions: competitionEntries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
    movements,
    retirements: context.retired,
    breakouts: await findBreakouts(label),
  };
  const report: SeasonReport = { ...body, highlights: deriveHighlights(body) };

  await db
    .insert(seasonReports)
    .values({ Year: label, Data: report as unknown as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: seasonReports.Year,
      set: { Data: report as unknown as Record<string, unknown>, updatedAt: new Date() },
    });
  return report;
}

export async function listSeasonReports(): Promise<SeasonReport[]> {
  const db = DrizzleDatabase.getInstance().database;
  const rows = await db.select().from(seasonReports).orderBy(desc(seasonReports.createdAt));
  return rows.map((r) => r.Data as unknown as SeasonReport);
}

export async function getSeasonReport(year: string): Promise<SeasonReport | null> {
  const db = DrizzleDatabase.getInstance().database;
  const [row] = await db.select().from(seasonReports).where(eq(seasonReports.Year, year));
  return row ? (row.Data as unknown as SeasonReport) : null;
}
