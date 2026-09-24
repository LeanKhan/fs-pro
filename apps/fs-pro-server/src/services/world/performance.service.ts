import { and, between, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  calendars,
  clubPerformance,
  clubs,
  competitions,
  entries,
  fixtures,
  levelHistory,
  seasonReports,
  seasons,
} from '../../db/drizzle/schema';
import { defaultLevelTargets } from '../competitions/definition';
import { levelForXp } from './level';
import { changeLevel } from './level-change';

/**
 * The board's view of a club (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Board and
 * performance"): every finished entry gets a 0..1 finish score; a club's
 * yearly performance score is the Prestige-weighted average of its finish
 * scores for editions that finished that year, plus a small Elo-change term
 * and 0.05 per trophy. A club that finished nothing scores 0. Recomputed at
 * every edition finish, frozen at year end, compared with the target for
 * the club's Level.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Calendar = typeof calendars.$inferSelect;

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;

async function world(): Promise<Calendar> {
  const [calendar] = await db().select().from(calendars).limit(1);
  if (!calendar)
    throw new Error('No calendar row: the game world has not been set up');
  return calendar;
}

/** The board's target score for a Level. */
export function expectedScore(
  level: number,
  calendar: Pick<Calendar, 'LevelTargets'>
) {
  const targets = calendar.LevelTargets?.length
    ? calendar.LevelTargets
    : defaultLevelTargets();
  return targets[Math.min(level, targets.length - 1)]!;
}

// ---------------------------------------------------------------------------
// Finish scores
// ---------------------------------------------------------------------------

/** Position-based finish: 1 for the top, 0 for the bottom; unranked 0. */
export function positionScore(
  position: number,
  entrants: number,
  ranked: boolean
) {
  if (!ranked) return 0;
  if (entrants <= 1) return 1;
  return round3(1 - (position - 1) / (entrants - 1));
}

/** Knockout finish: rounds survived / total rounds (winner 1). */
export function knockoutScore(lostInRound: number | null, totalRounds: number) {
  if (totalRounds <= 0) return 0;
  if (lostInRound == null) return 1;
  return round3((lostInRound - 1) / totalRounds);
}

/**
 * Write each entry's final position and finish score for a finished edition
 * (`order` is the final order, best first), then refresh those clubs'
 * performance scores. The last stage a club reached decides how it is
 * scored: a knockout by rounds survived, anything else by position.
 */
export async function scoreEdition(
  seasonId: string,
  order: { clubId: string; ranked: boolean }[]
) {
  const [season] = await db()
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  if (!season?.Definition) return;
  const stages = season.Definition.Stages;
  const rows = await db()
    .select()
    .from(entries)
    .where(eq(entries.SeasonId, seasonId));

  // Knockout rounds per stage and the round each club lost in.
  const koFixtures = await db()
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.SeasonId, seasonId), isNotNull(fixtures.Round)));
  const totalRounds = new Map<number, number>();
  const lostIn = new Map<string, number>();
  for (const f of koFixtures) {
    const stage = f.StageIndex ?? 0;
    totalRounds.set(stage, Math.max(totalRounds.get(stage) ?? 0, f.Round!));
    const tie = (f.Details as { Tie?: { loserId?: string } } | null)?.Tie;
    if (tie?.loserId) lostIn.set(tie.loserId, f.Round!);
  }

  await db().transaction(async (tx) => {
    for (const [i, o] of order.entries()) {
      const entry = rows.find((r) => r.ClubId === o.clubId);
      if (!entry) continue;
      const lastStage =
        entry.Status === 'eliminated'
          ? (entry.EliminatedAtStage ?? 0)
          : season.CurrentStage;
      const score =
        stages[lastStage]?.type === 'knockout'
          ? knockoutScore(
              lostIn.get(o.clubId) ?? null,
              totalRounds.get(lastStage) ?? 0
            )
          : positionScore(i + 1, order.length, o.ranked);
      await tx
        .update(entries)
        .set({
          FinalPosition: i + 1,
          FinishScore: score,
          updatedAt: new Date(),
        })
        .where(eq(entries.id, entry.id));
    }
  });
  await refreshPerformance(order.map((o) => o.clubId));
  await moveBoardConfidence(seasonId);
}

/**
 * The board reacts to each finish against the target for the club's Level:
 * beating it raises BoardConfidence, falling short lowers it, more so in
 * prestigious competitions (at most 12 points either way per edition).
 * Match-by-match form still nudges it too (club-standing.service.ts).
 */
export async function moveBoardConfidence(seasonId: string) {
  const calendar = await world();
  const rows = await db()
    .select({
      clubId: entries.ClubId,
      score: entries.FinishScore,
      confidence: clubs.BoardConfidence,
      XP: clubs.XP,
      definition: seasons.Definition,
    })
    .from(entries)
    .innerJoin(clubs, eq(clubs.id, entries.ClubId))
    .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
    .where(and(eq(entries.SeasonId, seasonId), isNotNull(entries.FinishScore)));
  for (const r of rows) {
    const level = levelForXp(r.XP, calendar.LevelThresholds ?? undefined);
    const expected = expectedScore(level, calendar);
    const prestige = r.definition?.Prestige ?? 2;
    const delta = Math.round(clamp((r.score! - expected) * 20 * (prestige / 3), -12, 12));
    if (!delta) continue;
    await db()
      .update(clubs)
      .set({ BoardConfidence: clamp(r.confidence + delta, 5, 95), updatedAt: new Date() })
      .where(eq(clubs.id, r.clubId));
  }
}

// ---------------------------------------------------------------------------
// Yearly score
// ---------------------------------------------------------------------------

/** A row for every club for the current year (Elo and Level at the start). */
export async function ensureYearRows(calendar?: Calendar) {
  const c = calendar ?? (await world());
  const all = await db()
    .select({ id: clubs.id, Elo: clubs.Elo, XP: clubs.XP })
    .from(clubs);
  if (!all.length) return;
  await db()
    .insert(clubPerformance)
    .values(
      all.map((club) => ({
        ClubId: club.id,
        Year: c.CurrentYear,
        EloStart: club.Elo,
        EloEnd: club.Elo,
        LevelStart: levelForXp(club.XP, c.LevelThresholds ?? undefined),
        LevelEnd: levelForXp(club.XP, c.LevelThresholds ?? undefined),
        updatedAt: new Date(),
      }))
    )
    .onConflictDoNothing();
}

/**
 * Recompute the performance score of `clubIds` (default: all) for `year`
 * (default: the current year, covering YearStartDay .. today). Frozen rows
 * are left alone.
 */
export async function refreshPerformance(
  clubIds?: string[],
  span?: { year: number; fromDay: number; toDay: number }
) {
  const calendar = await world();
  const year = span?.year ?? calendar.CurrentYear;
  const fromDay = span?.fromDay ?? calendar.YearStartDay;
  const toDay = span?.toDay ?? calendar.CurrentDay;
  if (year === calendar.CurrentYear) await ensureYearRows(calendar);

  const finished = await db()
    .select({
      clubId: entries.ClubId,
      score: entries.FinishScore,
      definition: seasons.Definition,
      winnerId: seasons.WinnerId,
    })
    .from(entries)
    .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
    .where(
      and(
        eq(seasons.Status, 'finished'),
        between(seasons.EndDay, fromDay, toDay),
        isNotNull(entries.FinishScore),
        clubIds ? inArray(entries.ClubId, clubIds) : undefined
      )
    );

  const rows = await db()
    .select({ perf: clubPerformance, Elo: clubs.Elo, XP: clubs.XP })
    .from(clubPerformance)
    .innerJoin(clubs, eq(clubs.id, clubPerformance.ClubId))
    .where(
      and(
        eq(clubPerformance.Year, year),
        eq(clubPerformance.Frozen, false),
        clubIds ? inArray(clubPerformance.ClubId, clubIds) : undefined
      )
    );

  for (const { perf, Elo, XP } of rows) {
    const mine = finished.filter((f) => f.clubId === perf.ClubId);
    const weight = (f: (typeof mine)[number]) => f.definition?.Prestige ?? 2;
    const totalWeight = mine.reduce((s, f) => s + weight(f), 0);
    const trophies = mine.filter((f) => f.winnerId === perf.ClubId).length;
    const score = mine.length
      ? round3(
          mine.reduce((s, f) => s + weight(f) * (f.score ?? 0), 0) /
            totalWeight +
            clamp((Elo - perf.EloStart) / 400, -0.1, 0.1) +
            0.05 * trophies
        )
      : 0;
    await db()
      .update(clubPerformance)
      .set({
        Score: score,
        Entries: mine.length,
        Trophies: trophies,
        EloEnd: Elo,
        LevelEnd: levelForXp(XP, calendar.LevelThresholds ?? undefined),
        updatedAt: new Date(),
      })
      .where(eq(clubPerformance.id, perf.id));
  }
}

export interface ReviewMove {
  clubId: string;
  change: 1 | -1;
}

/**
 * Year end (called by year.service after the new year is claimed): final
 * scores for the year that just ended, then freeze them; the optional Level
 * review; rows for the new year.
 */
export async function closeYear(span: {
  year: number;
  fromDay: number;
  toDay: number;
}): Promise<ReviewMove[]> {
  await refreshPerformance(undefined, span);
  await db()
    .update(clubPerformance)
    .set({ Frozen: true, updatedAt: new Date() })
    .where(eq(clubPerformance.Year, span.year));

  const calendar = await world();
  const moves = await levelReview(span, calendar);
  await ensureYearRows(calendar);
  return moves;
}

/**
 * Optional year-end review (world setting LevelReview): within each Level,
 * the top `promoteCount` clubs by performance score go up a Level and the
 * bottom `relegateCount` go down. Moves are dated on the year's last day and
 * respect "one move per club per year".
 */
async function levelReview(
  span: { year: number; fromDay: number; toDay: number },
  calendar: Calendar
): Promise<ReviewMove[]> {
  const review = calendar.LevelReview;
  if (!review?.enabled) return [];
  const rows = await db()
    .select()
    .from(clubPerformance)
    .where(eq(clubPerformance.Year, span.year));
  const byLevel = new Map<number, typeof rows>();
  for (const r of rows)
    byLevel.set(r.LevelEnd, [...(byLevel.get(r.LevelEnd) ?? []), r]);

  const moves: ReviewMove[] = [];
  for (const group of byLevel.values()) {
    const sorted = [...group].sort(
      (a, b) => b.Score - a.Score || (a.ClubId < b.ClubId ? -1 : 1)
    );
    const up = sorted.slice(0, review.promoteCount);
    const down = sorted.slice(
      Math.max(up.length, sorted.length - review.relegateCount)
    );
    for (const [list, change] of [
      [up, 1],
      [down, -1],
    ] as const) {
      for (const r of list) moves.push({ clubId: r.ClubId, change });
    }
  }

  const applied: ReviewMove[] = [];
  await db().transaction(async (tx) => {
    for (const m of moves) {
      const moved = await changeLevel(tx, m.clubId, m.change, {
        day: span.toDay,
        seasonId: null,
        calendar,
        sinceDay: span.fromDay,
        source: 'review',
      });
      if (moved) applied.push(m);
    }
  });
  return applied;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface PerformanceView {
  clubId: string;
  year: number;
  current: boolean;
  level: number;
  score: number;
  expected: number;
  /** score - expected: what the board acts on. */
  gap: number;
  entries: number;
  trophies: number;
  eloStart: number;
  eloEnd: number;
  levelStart: number;
  levelEnd: number;
  finishes: {
    seasonId: string;
    competitionName: string;
    editionCode: string;
    finalPosition: number | null;
    finishScore: number | null;
    prestige: number;
    endDay: number | null;
    won: boolean;
  }[];
  levelMoves: { day: number; from: number; to: number; source: string }[];
}

/** A club's performance for a year (default: the current one, refreshed). */
export async function getPerformance(
  clubId: string,
  year?: number
): Promise<PerformanceView> {
  const calendar = await world();
  const target = year ?? calendar.CurrentYear;
  if (target === calendar.CurrentYear) await refreshPerformance([clubId]);

  const [row] = await db()
    .select()
    .from(clubPerformance)
    .where(
      and(eq(clubPerformance.ClubId, clubId), eq(clubPerformance.Year, target))
    );
  if (!row) throw new Error(`No performance for this club in year ${target}`);

  // The year's days: current year from the calendar, past years from their report.
  let fromDay = calendar.YearStartDay;
  let toDay = calendar.CurrentDay;
  if (target !== calendar.CurrentYear) {
    const [span] = await db()
      .select({ FromDay: seasonReports.FromDay, ToDay: seasonReports.ToDay })
      .from(seasonReports)
      .where(eq(seasonReports.Year, `Y${target}`));
    fromDay = span?.FromDay ?? 0;
    toDay = span?.ToDay ?? 0;
  }

  const finishes = await db()
    .select({
      entry: entries,
      season: seasons,
      competitionName: competitions.Name,
    })
    .from(entries)
    .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
    .innerJoin(competitions, eq(competitions.id, seasons.CompetitionId))
    .where(
      and(
        eq(entries.ClubId, clubId),
        eq(seasons.Status, 'finished'),
        between(seasons.EndDay, fromDay, toDay)
      )
    )
    .orderBy(desc(seasons.EndDay));
  const moves = await db()
    .select()
    .from(levelHistory)
    .where(
      and(
        eq(levelHistory.ClubId, clubId),
        between(levelHistory.Day, fromDay, toDay)
      )
    )
    .orderBy(levelHistory.Day);

  const level = row.LevelEnd;
  const expected = expectedScore(level, calendar);
  return {
    clubId,
    year: target,
    current: target === calendar.CurrentYear,
    level,
    score: row.Score,
    expected,
    gap: round3(row.Score - expected),
    entries: row.Entries,
    trophies: row.Trophies,
    eloStart: row.EloStart,
    eloEnd: row.EloEnd,
    levelStart: row.LevelStart,
    levelEnd: row.LevelEnd,
    finishes: finishes.map((f) => ({
      seasonId: f.season.id,
      competitionName: f.competitionName,
      editionCode: f.season.SeasonCode,
      finalPosition: f.entry.FinalPosition,
      finishScore: f.entry.FinishScore,
      prestige: f.season.Definition?.Prestige ?? 2,
      endDay: f.season.EndDay,
      won: f.season.WinnerId === clubId,
    })),
    levelMoves: moves.map((m) => ({
      day: m.Day,
      from: m.FromLevel,
      to: m.ToLevel,
      source: m.Source,
    })),
  };
}
