import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { StageDefinition } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  calendars,
  clubMatchDetails,
  clubs,
  entries,
  fixtures,
  seasons,
} from '../../db/drizzle/schema';
import { findSlot } from './challenge.service';
import {
  decideTie,
  pairRound,
  type DrawRule,
  type LegResult,
  type Pairing,
} from './knockout';

/**
 * Knockout stages for open play (docs/OPEN-PLAY-COMPETITIONS-SPEC.md,
 * "Knockout stage"). A round is drawn when it opens, from the clubs still
 * in; each tie is scheduled at once on the first day both clubs are free
 * before its PlayBy deadline (forced onto the deadline if not, moving any
 * league challenge in the way). A round opens the day after the previous
 * round's last match. One club left = stage over; the caller finishes the
 * edition with the order returned.
 *
 * Ties are Fixtures with Round/Leg/PlayBy set and no ChallengeStatus. The
 * higher seed is the home side of a single leg and of the second leg. The
 * outcome is written into the last leg's Details.Tie; byes go in the
 * edition's Logs.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Db = ReturnType<typeof db>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Fixture = typeof fixtures.$inferSelect;
type Knockout = Extract<StageDefinition, { type: 'knockout' }>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stage names the match engine reads: 'knockout' makes it settle a drawn
 * single leg on penalties; 'ko-leg' leaves draws alone (decided here). */
const ENGINE_SHOOTOUT = 'knockout';
const NO_ENGINE_SHOOTOUT = 'ko-leg';

async function world(tx: Tx | Db) {
  const [calendar] = await tx.select().from(calendars).limit(1);
  if (!calendar)
    throw new Error('No calendar row: the game world has not been set up');
  return calendar;
}

function knockoutStage(
  season: typeof seasons.$inferSelect,
  stageIndex: number
): Knockout {
  const stage = season.Definition?.Stages[stageIndex];
  if (stage?.type !== 'knockout')
    throw new Error(
      `Stage ${stageIndex} of ${season.SeasonCode} is not a knockout`
    );
  return stage;
}

/**
 * Put a club pair on `day` even though one of them is busy: accepted league
 * challenges on that day are moved to their next free day before their
 * stage ends, or cancelled if there is none.
 */
async function clearDay(
  tx: Tx,
  clubIds: string[],
  day: number,
  keepFixtureIds: string[]
) {
  const clashes = await tx
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.ScheduledDay, day),
        eq(fixtures.ChallengeStatus, 'accepted'),
        eq(fixtures.Played, false),
        or(
          inArray(fixtures.HomeTeamId, clubIds),
          inArray(fixtures.AwayTeamId, clubIds)
        )
      )
    );
  const calendar = await world(tx);
  for (const f of clashes) {
    if (keepFixtureIds.includes(f.id)) continue;
    const [season] = await tx
      .select()
      .from(seasons)
      .where(eq(seasons.id, f.SeasonId!));
    const stage = season?.Definition?.Stages[f.StageIndex ?? 0];
    const lastDay =
      stage && stage.type !== 'knockout'
        ? (season!.StageStartedDay ?? 0) + stage.days - 1
        : day;
    // Park it off the day first so the slot search doesn't see it.
    await tx
      .update(fixtures)
      .set({ ScheduledDay: null })
      .where(eq(fixtures.id, f.id));
    const next = await findSlot(
      tx,
      [f.HomeTeamId!, f.AwayTeamId!],
      day + 1,
      lastDay
    );
    await tx
      .update(fixtures)
      .set(
        next == null
          ? {
              ChallengeStatus: 'cancelled',
              ScheduledDay: null,
              ScheduledDate: null,
              updatedAt: new Date(),
            }
          : {
              ScheduledDay: next,
              ScheduledDate: new Date(
                calendar.CurrentDate.getTime() +
                  (next - calendar.CurrentDay) * DAY_MS
              ),
              updatedAt: new Date(),
            }
      )
      .where(eq(fixtures.id, f.id));
  }
}

/** Seeds for the clubs still in, per the stage's seeding rule. */
async function seededClubs(tx: Tx, seasonId: string, stage: Knockout) {
  const rows = await tx
    .select({ clubId: entries.ClubId, seed: entries.Seed, elo: clubs.Elo })
    .from(entries)
    .innerJoin(clubs, eq(clubs.id, entries.ClubId))
    .where(and(eq(entries.SeasonId, seasonId), eq(entries.Status, 'active')));
  const byElo = [...rows].sort(
    (a, b) => b.elo - a.elo || (a.clubId < b.clubId ? -1 : 1)
  );
  if (stage.seeding === 'previous-stage') {
    const bySeed = [...rows].sort(
      (a, b) =>
        (a.seed ?? 1e9) - (b.seed ?? 1e9) ||
        b.elo - a.elo ||
        (a.clubId < b.clubId ? -1 : 1)
    );
    return bySeed.map((r, i) => ({ clubId: r.clubId, seed: i + 1 }));
  }
  return byElo.map((r, i) => ({ clubId: r.clubId, seed: i + 1 }));
}

export interface DrawResult {
  round: number;
  ties: number;
  bye: string | null;
}

/** Draw and schedule round `round` of a knockout stage. */
export async function drawRound(
  seasonId: string,
  stageIndex: number,
  round: number,
  rng: () => number = Math.random
): Promise<DrawResult> {
  return db().transaction(async (tx) => {
    const [season] = await tx
      .select()
      .from(seasons)
      .where(eq(seasons.id, seasonId))
      .for('update');
    if (!season) throw new Error(`Edition ${seasonId} not found`);
    const stage = knockoutStage(season, stageIndex);

    const already = await tx
      .select({ id: fixtures.id })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.SeasonId, seasonId),
          eq(fixtures.StageIndex, stageIndex),
          eq(fixtures.Round, round)
        )
      )
      .limit(1);
    if (already.length) return { round, ties: 0, bye: null };

    const seeded = await seededClubs(tx, seasonId, stage);
    if (seeded.length < 2) return { round, ties: 0, bye: null };
    const { pairs, bye } = pairRound(seeded, {
      random: stage.seeding === 'random',
      rng,
    });

    // Lock every club in the draw (id order) so nothing else books their days meanwhile.
    await tx
      .select({ id: clubs.id })
      .from(clubs)
      .where(
        inArray(
          clubs.id,
          seeded.map((s) => s.clubId)
        )
      )
      .orderBy(clubs.id)
      .for('update');
    const names = new Map(
      (
        await tx
          .select({ id: clubs.id, Name: clubs.Name, ClubCode: clubs.ClubCode })
          .from(clubs)
          .where(
            inArray(
              clubs.id,
              seeded.map((s) => s.clubId)
            )
          )
      ).map((c) => [c.id, c])
    );

    const calendar = await world(tx);
    const today = calendar.CurrentDay;
    const twoLegs = stage.legs === 2;
    const playBy =
      today + (twoLegs ? Math.max(stage.tieDays, 2) : stage.tieDays);
    const stageName =
      !twoLegs && stage.drawAtEnd === 'penalties'
        ? ENGINE_SHOOTOUT
        : NO_ENGINE_SHOOTOUT;
    const dateOf = (day: number) =>
      new Date(
        calendar.CurrentDate.getTime() + (day - calendar.CurrentDay) * DAY_MS
      );

    const insertLeg = async (
      homeId: string,
      awayId: string,
      leg: number,
      day: number
    ) => {
      const home = names.get(homeId)!;
      const away = names.get(awayId)!;
      const [f] = await tx
        .insert(fixtures)
        .values({
          Title: `${home.Name} vs ${away.Name}`,
          SeasonId: seasonId,
          SeasonCode: season.SeasonCode,
          LeagueCode: season.CompetitionCode,
          CompetitionId: season.CompetitionId,
          StageIndex: stageIndex,
          Stage: stageName,
          Type: 'knockout',
          Round: round,
          Leg: leg,
          PlayBy: playBy,
          Home: home.ClubCode,
          Away: away.ClubCode,
          HomeTeamId: homeId,
          AwayTeamId: awayId,
          ScheduledDay: day,
          ScheduledDate: dateOf(day),
          updatedAt: new Date(),
        })
        .returning({ id: fixtures.id });
      return f!.id;
    };

    for (const pair of pairs) {
      const both = [pair.high, pair.low];
      if (!twoLegs) {
        const free = await findSlot(tx, both, today + 1, playBy);
        const day = free ?? playBy;
        const id = await insertLeg(pair.high, pair.low, 1, day);
        if (free == null) await clearDay(tx, both, day, [id]);
      } else {
        const free1 = await findSlot(tx, both, today + 1, playBy - 1);
        const day1 = free1 ?? playBy - 1;
        const id1 = await insertLeg(pair.low, pair.high, 1, day1);
        if (free1 == null) await clearDay(tx, both, day1, [id1]);
        const free2 = await findSlot(tx, both, day1 + 1, playBy);
        const day2 = free2 ?? playBy;
        const id2 = await insertLeg(pair.high, pair.low, 2, day2);
        if (free2 == null) await clearDay(tx, both, day2, [id2]);
      }
    }

    if (bye) {
      await tx
        .update(seasons)
        .set({
          Logs: sql`${seasons.Logs} || ${JSON.stringify([
            {
              title: 'Bye',
              content: `${names.get(bye)!.Name} has a bye`,
              stageIndex,
              round,
              clubId: bye,
            },
          ])}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(seasons.id, seasonId));
    }
    return { round, ties: pairs.length, bye };
  });
}

/** Group a round's fixtures into ties (one or two legs per club pair). */
function tiesOf(roundFixtures: Fixture[]) {
  const ties = new Map<string, Fixture[]>();
  for (const f of roundFixtures) {
    const key = [f.HomeTeamId, f.AwayTeamId].sort().join('|');
    ties.set(key, [...(ties.get(key) ?? []), f]);
  }
  return [...ties.values()].map((legs) =>
    legs.sort((a, b) => (a.Leg ?? 1) - (b.Leg ?? 1))
  );
}

/** The higher seed is the home side of a single leg and of the second leg. */
function pairingOf(legs: Fixture[]): Pairing {
  const last = legs[legs.length - 1]!;
  return { high: last.HomeTeamId!, low: last.AwayTeamId! };
}

function engineWinner(f: Fixture): string | null {
  const d = (f.Details ?? {}) as { Winner?: string | { id?: string } | null };
  return typeof d.Winner === 'string' ? d.Winner : (d.Winner?.id ?? null);
}

async function legResults(tx: Tx, legs: Fixture[]): Promise<LegResult[]> {
  const sideIds = legs
    .flatMap((l) => [l.HomeSideDetailsId, l.AwaySideDetailsId])
    .filter((x): x is string => !!x);
  const sides = sideIds.length
    ? await tx
        .select()
        .from(clubMatchDetails)
        .where(inArray(clubMatchDetails.id, sideIds))
    : [];
  const goals = (id: string | null) =>
    sides.find((s) => s.id === id)?.Goals ?? 0;
  return legs.map((l) => ({
    homeId: l.HomeTeamId!,
    awayId: l.AwayTeamId!,
    homeGoals: goals(l.HomeSideDetailsId),
    awayGoals: goals(l.AwaySideDetailsId),
    engineWinnerId: engineWinner(l),
  }));
}

export type AdvanceResult =
  | { status: 'waiting' }
  | { status: 'drawn'; round: number; ties: number; bye: string | null }
  | { status: 'done'; order: string[] };

/**
 * Daily step for a running knockout stage: settle finished ties, and when
 * the round is over (and its last match day has passed) draw the next one,
 * or report the stage done with the final order.
 */
export async function advanceKnockout(
  seasonId: string,
  rng: () => number = Math.random
): Promise<AdvanceResult> {
  const [season] = await db()
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  if (!season || season.Status !== 'running') return { status: 'waiting' };
  const stageIndex = season.CurrentStage;
  const stage = knockoutStage(season, stageIndex);
  const today = (await world(db())).CurrentDay;

  const stageFixtures = await db()
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.SeasonId, seasonId),
        eq(fixtures.StageIndex, stageIndex),
        isNotNull(fixtures.Round)
      )
    );
  const round = Math.max(0, ...stageFixtures.map((f) => f.Round ?? 0));

  if (round > 0) {
    const current = stageFixtures.filter((f) => f.Round === round);
    const ties = tiesOf(current);
    if (current.some((f) => !f.Played)) {
      // Settle what's finished so the bracket shows it; wait for the rest.
      for (const legs of ties)
        if (legs.every((l) => l.Played))
          await settleTie(seasonId, stageIndex, legs, stage, rng);
      return { status: 'waiting' };
    }
    for (const legs of ties)
      await settleTie(seasonId, stageIndex, legs, stage, rng);
    const lastDay = Math.max(...current.map((f) => f.ScheduledDay ?? 0));
    if (today <= lastDay) return { status: 'waiting' };
  }

  const stillIn = await db()
    .select({ clubId: entries.ClubId })
    .from(entries)
    .where(and(eq(entries.SeasonId, seasonId), eq(entries.Status, 'active')));
  if (stillIn.length <= 1)
    return { status: 'done', order: await knockoutOrder(seasonId, stageIndex) };

  const drawn = await drawRound(seasonId, stageIndex, round + 1, rng);
  return { status: 'drawn', ...drawn };
}

/** Decide a finished tie once: write Details.Tie on its last leg and
 * eliminate the loser. */
async function settleTie(
  seasonId: string,
  stageIndex: number,
  legs: Fixture[],
  stage: Knockout,
  rng: () => number
) {
  await db().transaction(async (tx) => {
    const last = legs[legs.length - 1]!;
    const [fresh] = await tx
      .select()
      .from(fixtures)
      .where(eq(fixtures.id, last.id))
      .for('update');
    if ((fresh?.Details as { Tie?: unknown } | null)?.Tie) return;

    const pairing = pairingOf(legs);
    const outcome = decideTie(
      pairing,
      await legResults(tx, legs),
      stage.drawAtEnd as DrawRule,
      rng
    );
    await tx
      .update(fixtures)
      .set({
        Details: { ...fresh!.Details, Tie: outcome },
        updatedAt: new Date(),
      })
      .where(eq(fixtures.id, last.id));
    await tx
      .update(entries)
      .set({
        Status: 'eliminated',
        EliminatedAtStage: stageIndex,
        updatedAt: new Date(),
      })
      .where(
        and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, outcome.loserId))
      );
  });
}

/** Winner, runner-up, then by round lost (later first), then by seed. */
async function knockoutOrder(
  seasonId: string,
  stageIndex: number
): Promise<string[]> {
  const stageFixtures = await db()
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.SeasonId, seasonId),
        eq(fixtures.StageIndex, stageIndex),
        isNotNull(fixtures.Round)
      )
    )
    .orderBy(desc(fixtures.Round));
  const lostIn = new Map<string, number>();
  for (const f of stageFixtures) {
    const tie = (f.Details as { Tie?: { loserId: string } } | null)?.Tie;
    if (tie && !lostIn.has(tie.loserId)) lostIn.set(tie.loserId, f.Round!);
  }
  const everyone = await db()
    .select({
      clubId: entries.ClubId,
      status: entries.Status,
      seed: entries.Seed,
      eliminatedAt: entries.EliminatedAtStage,
    })
    .from(entries)
    .where(eq(entries.SeasonId, seasonId));
  const inStage = everyone.filter(
    (e) =>
      e.status === 'active' ||
      (e.status === 'eliminated' && e.eliminatedAt === stageIndex)
  );
  return inStage
    .sort(
      (a, b) =>
        Number(b.status === 'active') - Number(a.status === 'active') ||
        (lostIn.get(b.clubId) ?? 0) - (lostIn.get(a.clubId) ?? 0) ||
        (a.seed ?? 1e9) - (b.seed ?? 1e9)
    )
    .map((e) => e.clubId);
}

export interface BracketLeg {
  fixtureId: string;
  leg: number;
  homeClubId: string;
  awayClubId: string;
  scheduledDay: number | null;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface BracketTie {
  highSeedClubId: string;
  lowSeedClubId: string;
  playBy: number | null;
  legs: BracketLeg[];
  winnerId: string | null;
  decidedBy: string | null;
}

export interface BracketRound {
  round: number;
  ties: BracketTie[];
  byeClubId: string | null;
}

/** Rounds drawn so far for a knockout stage (current stage by default). */
export async function getBracket(seasonId: string, stageIndex?: number) {
  const [season] = await db()
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  if (!season) throw new Error(`Edition ${seasonId} not found`);
  const index =
    stageIndex ??
    (() => {
      const stages = season.Definition?.Stages ?? [];
      const ko = stages.findIndex((s) => s.type === 'knockout');
      return ko >= 0 ? ko : season.CurrentStage;
    })();

  const rows = await db()
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.SeasonId, seasonId),
        eq(fixtures.StageIndex, index),
        isNotNull(fixtures.Round)
      )
    )
    .orderBy(fixtures.Round, fixtures.Leg);
  const sideIds = rows
    .flatMap((f) => [f.HomeSideDetailsId, f.AwaySideDetailsId])
    .filter((x): x is string => !!x);
  const sides = sideIds.length
    ? await db()
        .select()
        .from(clubMatchDetails)
        .where(inArray(clubMatchDetails.id, sideIds))
    : [];
  const goals = (f: Fixture, id: string | null) =>
    f.Played ? (sides.find((s) => s.id === id)?.Goals ?? 0) : null;
  const byes = (
    (season.Logs ?? []) as {
      title?: string;
      stageIndex?: number;
      round?: number;
      clubId?: string;
    }[]
  ).filter((l) => l.title === 'Bye' && l.stageIndex === index);

  const rounds: BracketRound[] = [];
  for (const r of new Set(rows.map((f) => f.Round!))) {
    const ties = tiesOf(rows.filter((f) => f.Round === r)).map((legs) => {
      const pairing = pairingOf(legs);
      const tie = (
        legs[legs.length - 1]!.Details as {
          Tie?: { winnerId: string; decidedBy: string };
        } | null
      )?.Tie;
      return {
        highSeedClubId: pairing.high,
        lowSeedClubId: pairing.low,
        playBy: legs[0]!.PlayBy,
        legs: legs.map((l) => ({
          fixtureId: l.id,
          leg: l.Leg ?? 1,
          homeClubId: l.HomeTeamId!,
          awayClubId: l.AwayTeamId!,
          scheduledDay: l.ScheduledDay,
          played: l.Played,
          homeGoals: goals(l, l.HomeSideDetailsId),
          awayGoals: goals(l, l.AwaySideDetailsId),
        })),
        winnerId: tie?.winnerId ?? null,
        decidedBy: tie?.decidedBy ?? null,
      };
    });
    rounds.push({
      round: r,
      ties,
      byeClubId: byes.find((b) => b.round === r)?.clubId ?? null,
    });
  }
  return { seasonId, stageIndex: index, rounds };
}

export const KnockoutService = { drawRound, advanceKnockout, getBracket };
