import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import type { LeagueRules } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  calendars,
  clubs,
  competitions,
  entries,
  fixtures,
  seasons,
} from '../../db/drizzle/schema';
import { resolveLeagueRules } from './definition';
import { applyResult, getStageTable } from './ranking.service';

/**
 * Challenges and the match scheduler for open-play league/groups stages
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Challenges" and "Scheduling").
 *
 * A challenge is a Fixture row: ChallengeStatus moves
 *   proposed -> accepted -> played
 *   proposed -> declined | expired | forfeited | cancelled
 * The challenged club plays at home. Accepting puts the match on the first
 * day both clubs are free, in any competition, before the stage ends.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Db = ReturnType<typeof db>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Season = typeof seasons.$inferSelect;
type Fixture = typeof fixtures.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

export class ChallengeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not-found'
      | 'not-allowed'
      | 'wrong-status'
      | 'ineligible'
      | 'no-slot',
    public readonly reasons: string[] = [message]
  ) {
    super(message);
  }
}

async function world(tx: Tx | Db) {
  const [calendar] = await tx.select().from(calendars).limit(1);
  if (!calendar)
    throw new Error('No calendar row: the game world has not been set up');
  return calendar;
}

/** Game day -> the calendar date it falls on. */
function dateOfDay(calendar: typeof calendars.$inferSelect, day: number) {
  return new Date(
    calendar.CurrentDate.getTime() + (day - calendar.CurrentDay) * DAY_MS
  );
}

/** The running league/groups stage of an edition, with its rules and last day. */
function openStage(
  season: Season,
  worldDefaults: Partial<LeagueRules> | null,
  today: number
) {
  const def = season.Definition;
  const stage = def?.Stages[season.CurrentStage];
  if (season.Status !== 'running' || !stage || stage.type === 'knockout')
    return null;
  const lastDay = (season.StageStartedDay ?? 0) + stage.days - 1;
  if (today > lastDay) return null;
  return {
    stage,
    stageIndex: season.CurrentStage,
    rules: resolveLeagueRules(stage, worldDefaults),
    lastDay,
  };
}

/** Lock clubs in id order so two actions on the same clubs can't interleave. */
async function lockClubs(tx: Tx, clubIds: string[]) {
  return tx
    .select({ id: clubs.id, Name: clubs.Name, ClubCode: clubs.ClubCode })
    .from(clubs)
    .where(inArray(clubs.id, clubIds))
    .orderBy(clubs.id)
    .for('update');
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * First day in [fromDay, lastDay] on which none of `clubIds` already has a
 * fixture in any competition, or null.
 */
export async function findSlot(
  tx: Tx | Db,
  clubIds: string[],
  fromDay: number,
  lastDay: number
): Promise<number | null> {
  if (fromDay > lastDay) return null;
  const busy = await tx
    .selectDistinct({ day: fixtures.ScheduledDay })
    .from(fixtures)
    .where(
      and(
        or(
          inArray(fixtures.HomeTeamId, clubIds),
          inArray(fixtures.AwayTeamId, clubIds)
        ),
        gte(fixtures.ScheduledDay, fromDay),
        lte(fixtures.ScheduledDay, lastDay),
        // Cancelled challenges free their day.
        or(
          sql`${fixtures.ChallengeStatus} is null`,
          inArray(fixtures.ChallengeStatus, ['accepted', 'played'])
        )
      )
    );
  const taken = new Set(busy.map((b) => b.day));
  for (let day = fromDay; day <= lastDay; day++)
    if (!taken.has(day)) return day;
  return null;
}

// ---------------------------------------------------------------------------
// Proposal rules
// ---------------------------------------------------------------------------

interface Context {
  season: Season;
  stageIndex: number;
  rules: LeagueRules;
  lastDay: number;
  today: number;
}

async function context(tx: Tx | Db, seasonId: string): Promise<Context> {
  const [season] = await tx
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  if (!season)
    throw new ChallengeError(`Edition ${seasonId} not found`, 'not-found');
  const calendar = await world(tx);
  const open = openStage(
    season,
    calendar.DefaultRules ?? null,
    calendar.CurrentDay
  );
  if (!open)
    throw new ChallengeError(
      'No league or group stage is open for challenges',
      'wrong-status'
    );
  return {
    season,
    stageIndex: open.stageIndex,
    rules: open.rules,
    lastDay: open.lastDay,
    today: calendar.CurrentDay,
  };
}

/** Why `challengerId` can't challenge `opponentId` now (empty = allowed). */
async function proposalReasons(
  tx: Tx | Db,
  ctx: Context,
  challengerId: string,
  opponentId: string,
  ranks?: Map<string, number | null>
): Promise<string[]> {
  const reasons: string[] = [];
  const { season, stageIndex, rules, today } = ctx;
  if (challengerId === opponentId) return ["A club can't challenge itself"];

  // 1. Both active in this stage, same group for groups.
  const pair = await tx
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.SeasonId, season.id),
        inArray(entries.ClubId, [challengerId, opponentId])
      )
    );
  const me = pair.find((e) => e.ClubId === challengerId);
  const them = pair.find((e) => e.ClubId === opponentId);
  if (me?.Status !== 'active') return ['You are not playing in this stage'];
  if (them?.Status !== 'active') return ['They are not playing in this stage'];
  if (me.Group !== them.Group) return ['Not in your group'];

  // Stage fixtures involving either club (challenges only, not cancelled).
  const stageFixtures = await tx
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.SeasonId, season.id),
        eq(fixtures.StageIndex, stageIndex),
        or(
          inArray(fixtures.HomeTeamId, [challengerId, opponentId]),
          inArray(fixtures.AwayTeamId, [challengerId, opponentId])
        ),
        inArray(fixtures.ChallengeStatus, [
          'proposed',
          'accepted',
          'played',
          'forfeited',
        ])
      )
    );
  const involves = (f: Fixture, id: string) =>
    f.HomeTeamId === id || f.AwayTeamId === id;
  const committed = (f: Fixture) =>
    ['accepted', 'played', 'forfeited'].includes(f.ChallengeStatus ?? '');

  // 3. Game cap.
  if (rules.maxGames != null) {
    if (
      stageFixtures.filter((f) => committed(f) && involves(f, challengerId))
        .length >= rules.maxGames
    ) {
      reasons.push(`You have reached ${rules.maxGames} games`);
    }
    if (
      stageFixtures.filter((f) => committed(f) && involves(f, opponentId))
        .length >= rules.maxGames
    ) {
      reasons.push(`They have reached ${rules.maxGames} games`);
    }
  }

  const between = stageFixtures.filter(
    (f) => involves(f, challengerId) && involves(f, opponentId)
  );
  // 4. Pair cap.
  const met = between.filter(committed);
  if (met.length >= rules.maxVsSameOpponent) {
    reasons.push(
      `Already played ${met.length} time${met.length === 1 ? '' : 's'}`
    );
  }
  // 5. Rematch cooldown.
  const lastMeeting = Math.max(
    -Infinity,
    ...met.map((f) => f.ScheduledDay ?? -Infinity)
  );
  if (
    Number.isFinite(lastMeeting) &&
    today - lastMeeting < rules.rematchCooldownDays
  ) {
    reasons.push(
      `Cooldown: ${rules.rematchCooldownDays - (today - lastMeeting)} days`
    );
  }
  // 8. Nothing already pending between them.
  if (
    between.some(
      (f) =>
        f.ChallengeStatus === 'proposed' ||
        (f.ChallengeStatus === 'accepted' && !f.Played)
    )
  ) {
    reasons.push('A challenge between you is already pending');
  }
  // 7. Open challenge cap.
  const [{ open }] = await tx
    .select({ open: count() })
    .from(fixtures)
    .where(
      and(
        eq(fixtures.SeasonId, season.id),
        eq(fixtures.ChallengerClubId, challengerId),
        eq(fixtures.ChallengeStatus, 'proposed')
      )
    );
  if (open >= rules.maxOpenChallenges)
    reasons.push(`You already have ${open} open challenges`);

  // 6. Rank range (only once both are ranked).
  if (rules.challengeRange > 0) {
    const rankOf = ranks ?? (await stageRanks(season.id, stageIndex));
    const a = rankOf.get(challengerId);
    const b = rankOf.get(opponentId);
    if (a != null && b != null && Math.abs(a - b) > rules.challengeRange) {
      reasons.push(`Outside range (${rules.challengeRange} places)`);
    }
  }

  return reasons;
}

async function stageRanks(seasonId: string, stageIndex: number) {
  const table = await getStageTable(seasonId, stageIndex);
  const ranks = new Map<string, number | null>();
  for (const g of table.groups)
    for (const r of g.rows) ranks.set(r.row.ClubId, r.rank);
  return ranks;
}

export interface OpponentOption {
  clubId: string;
  name: string;
  clubCode: string;
  rank: number | null;
  elo: number;
  eligible: boolean;
  reasons: string[];
}

/** Everyone the club could face in its current stage, with reasons for
 * those it can't challenge right now. Eligible first, then by Rank. */
export async function eligibleOpponents(
  seasonId: string,
  clubId: string
): Promise<OpponentOption[]> {
  const ctx = await context(db(), seasonId);
  const [mine] = await db()
    .select()
    .from(entries)
    .where(and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, clubId)));
  if (mine?.Status !== 'active')
    throw new ChallengeError(
      'You are not playing in this stage',
      'not-allowed'
    );

  const others = await db()
    .select({
      id: clubs.id,
      Name: clubs.Name,
      ClubCode: clubs.ClubCode,
      Elo: clubs.Elo,
      Group: entries.Group,
    })
    .from(entries)
    .innerJoin(clubs, eq(clubs.id, entries.ClubId))
    .where(
      and(
        eq(entries.SeasonId, seasonId),
        eq(entries.Status, 'active'),
        ne(entries.ClubId, clubId)
      )
    );
  const ranks = await stageRanks(seasonId, ctx.stageIndex);

  const options: OpponentOption[] = [];
  for (const o of others.filter((o) => o.Group === mine.Group)) {
    const reasons = await proposalReasons(db(), ctx, clubId, o.id, ranks);
    options.push({
      clubId: o.id,
      name: o.Name,
      clubCode: o.ClubCode,
      rank: ranks.get(o.id) ?? null,
      elo: o.Elo,
      eligible: reasons.length === 0,
      reasons,
    });
  }
  return options.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      (a.rank ?? 1e9) - (b.rank ?? 1e9) ||
      b.elo - a.elo
  );
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Propose a challenge. The challenged club will play at home. */
export async function propose(
  seasonId: string,
  challengerId: string,
  opponentId: string
): Promise<Fixture> {
  return db().transaction(async (tx) => {
    const locked = await lockClubs(tx, [challengerId, opponentId]);
    const ctx = await context(tx, seasonId);
    const reasons = await proposalReasons(tx, ctx, challengerId, opponentId);
    if (reasons.length)
      throw new ChallengeError(reasons.join('; '), 'ineligible', reasons);

    const home = locked.find((c) => c.id === opponentId)!;
    const away = locked.find((c) => c.id === challengerId)!;
    const [competition] = await tx
      .select({ CompetitionCode: competitions.CompetitionCode })
      .from(competitions)
      .where(eq(competitions.id, ctx.season.CompetitionId!));
    const [created] = await tx
      .insert(fixtures)
      .values({
        Title: `${home.Name} vs ${away.Name}`,
        SeasonId: seasonId,
        SeasonCode: ctx.season.SeasonCode,
        LeagueCode: competition?.CompetitionCode ?? ctx.season.CompetitionCode,
        CompetitionId: ctx.season.CompetitionId,
        StageIndex: ctx.stageIndex,
        Stage: 'open-match',
        Type: 'league',
        Home: home.ClubCode,
        Away: away.ClubCode,
        HomeTeamId: home.id,
        AwayTeamId: away.id,
        ChallengeStatus: 'proposed',
        ChallengerClubId: challengerId,
        ProposedAt: new Date(),
        RespondBy: Math.min(
          ctx.today + ctx.rules.respondWithinDays,
          ctx.lastDay
        ),
        updatedAt: new Date(),
      })
      .returning();
    return created!;
  });
}

async function loadChallenge(tx: Tx, fixtureId: string) {
  const [fixture] = await tx
    .select()
    .from(fixtures)
    .where(eq(fixtures.id, fixtureId));
  if (!fixture || !fixture.ChallengeStatus || !fixture.SeasonId) {
    throw new ChallengeError('Challenge not found', 'not-found');
  }
  return fixture;
}

/** The challenged club accepts: the match goes on the first free day. */
export async function accept(
  fixtureId: string,
  byClubId: string
): Promise<Fixture> {
  return db().transaction(async (tx) => {
    const peek = await loadChallenge(tx, fixtureId);
    await lockClubs(tx, [peek.HomeTeamId!, peek.AwayTeamId!]);
    const fixture = await loadChallenge(tx, fixtureId);
    if (fixture.HomeTeamId !== byClubId)
      throw new ChallengeError(
        'Only the challenged club can accept',
        'not-allowed'
      );
    if (fixture.ChallengeStatus !== 'proposed') {
      throw new ChallengeError(
        `Challenge is ${fixture.ChallengeStatus}`,
        'wrong-status'
      );
    }
    const ctx = await context(tx, fixture.SeasonId!);
    if (fixture.StageIndex !== ctx.stageIndex)
      throw new ChallengeError('That stage is over', 'wrong-status');
    if (fixture.RespondBy != null && ctx.today > fixture.RespondBy) {
      throw new ChallengeError('Too late to accept', 'wrong-status');
    }

    const day = await findSlot(
      tx,
      [fixture.HomeTeamId!, fixture.AwayTeamId!],
      ctx.today + 1,
      ctx.lastDay
    );
    if (day == null) {
      throw new ChallengeError(
        'No free day for both clubs before this stage ends',
        'no-slot'
      );
    }
    const calendar = await world(tx);
    const [updated] = await tx
      .update(fixtures)
      .set({
        ChallengeStatus: 'accepted',
        ScheduledDay: day,
        ScheduledDate: dateOfDay(calendar, day),
        updatedAt: new Date(),
      })
      .where(eq(fixtures.id, fixtureId))
      .returning();
    return updated!;
  });
}

/** Declines (and expiries) this club has made in this edition so far. */
async function declineCount(tx: Tx, seasonId: string, clubId: string) {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(fixtures)
    .where(
      and(
        eq(fixtures.SeasonId, seasonId),
        eq(fixtures.HomeTeamId, clubId),
        inArray(fixtures.ChallengeStatus, ['declined', 'expired', 'forfeited'])
      )
    );
  return n;
}

/** Declines (including expiries and forfeits) a club has made in an edition. */
export async function declinesSoFar(seasonId: string, clubId: string) {
  return db().transaction((tx) => declineCount(tx, seasonId, clubId));
}

/**
 * Decline (or let expire). Once the club has declined
 * `minDeclinesBeforeForfeit` times in this edition, the next one is a
 * forfeit: the challenger wins 3-0 and it goes into the table.
 */
async function refuse(tx: Tx, fixture: Fixture, as: 'declined' | 'expired') {
  const [season] = await tx
    .select()
    .from(seasons)
    .where(eq(seasons.id, fixture.SeasonId!));
  const calendar = await world(tx);
  const stage = season?.Definition?.Stages[fixture.StageIndex ?? 0];
  const rules =
    stage && stage.type !== 'knockout'
      ? resolveLeagueRules(stage, calendar.DefaultRules ?? null)
      : null;
  const before = await declineCount(tx, fixture.SeasonId!, fixture.HomeTeamId!);
  const forfeit = rules != null && before >= rules.minDeclinesBeforeForfeit;

  await tx
    .update(fixtures)
    .set({
      ChallengeStatus: forfeit ? 'forfeited' : as,
      // A forfeit is a finished match (3-0) on today's date, never simulated.
      ScheduledDay: forfeit ? calendar.CurrentDay : null,
      Played: forfeit,
      PlayedAt: forfeit ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(fixtures.id, fixture.id));
  return forfeit;
}

export async function decline(fixtureId: string, byClubId: string) {
  const { forfeit, fixture } = await db().transaction(async (tx) => {
    const peek = await loadChallenge(tx, fixtureId);
    await lockClubs(tx, [peek.HomeTeamId!, peek.AwayTeamId!]);
    const fixture = await loadChallenge(tx, fixtureId);
    if (fixture.HomeTeamId !== byClubId)
      throw new ChallengeError(
        'Only the challenged club can decline',
        'not-allowed'
      );
    if (fixture.ChallengeStatus !== 'proposed') {
      throw new ChallengeError(
        `Challenge is ${fixture.ChallengeStatus}`,
        'wrong-status'
      );
    }
    return { forfeit: await refuse(tx, fixture, 'declined'), fixture };
  });
  // Outside the transaction: applyResult runs its own (and locks the clubs).
  if (forfeit)
    await applyResult(fixture.id, { forfeitedBy: fixture.HomeTeamId! });
  return { forfeited: forfeit };
}

/** The challenger (or an admin) withdraws a challenge not yet answered. */
export async function cancel(fixtureId: string, byClubId: string | 'admin') {
  return db().transaction(async (tx) => {
    const fixture = await loadChallenge(tx, fixtureId);
    if (byClubId !== 'admin' && fixture.ChallengerClubId !== byClubId) {
      throw new ChallengeError('Only the challenger can cancel', 'not-allowed');
    }
    const allowed =
      byClubId === 'admin' ? ['proposed', 'accepted'] : ['proposed'];
    if (!allowed.includes(fixture.ChallengeStatus ?? '') || fixture.Played) {
      throw new ChallengeError(
        `Challenge is ${fixture.ChallengeStatus}`,
        'wrong-status'
      );
    }
    const [updated] = await tx
      .update(fixtures)
      .set({
        ChallengeStatus: 'cancelled',
        ScheduledDay: null,
        ScheduledDate: null,
        updatedAt: new Date(),
      })
      .where(eq(fixtures.id, fixtureId))
      .returning();
    return updated!;
  });
}

/** Daily: proposed challenges past RespondBy expire (counting as declines). */
export async function expireChallenges(today?: number) {
  const day = today ?? (await world(db())).CurrentDay;
  const stale = await db()
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(
      and(eq(fixtures.ChallengeStatus, 'proposed'), lt(fixtures.RespondBy, day))
    )
    .orderBy(fixtures.ProposedAt);
  let expired = 0;
  let forfeited = 0;
  for (const { id } of stale) {
    const result = await db().transaction(async (tx) => {
      const f = await loadChallenge(tx, id);
      await lockClubs(tx, [f.HomeTeamId!, f.AwayTeamId!]);
      const fixture = await loadChallenge(tx, id);
      if (fixture.ChallengeStatus !== 'proposed') return null;
      return { fixture, forfeit: await refuse(tx, fixture, 'expired') };
    });
    if (!result) continue;
    if (result.forfeit) {
      forfeited++;
      await applyResult(result.fixture.id, {
        forfeitedBy: result.fixture.HomeTeamId!,
      });
    } else expired++;
  }
  return { expired, forfeited };
}

export type ChallengeDirection = 'incoming' | 'outgoing';

export interface ClubChallenge {
  fixture: Fixture;
  direction: ChallengeDirection;
  competitionName: string | null;
}

/** A club's challenges across every edition, newest first. */
export async function clubChallenges(
  clubId: string,
  statuses?: string[]
): Promise<ClubChallenge[]> {
  const rows = await db()
    .select({ fixture: fixtures, competitionName: competitions.Name })
    .from(fixtures)
    .leftJoin(competitions, eq(competitions.id, fixtures.CompetitionId))
    .where(
      and(
        sql`${fixtures.ChallengeStatus} is not null`,
        or(eq(fixtures.HomeTeamId, clubId), eq(fixtures.AwayTeamId, clubId)),
        statuses?.length
          ? inArray(fixtures.ChallengeStatus, statuses)
          : undefined
      )
    )
    .orderBy(desc(fixtures.ProposedAt))
    .limit(200);
  return rows.map((r) => ({
    fixture: r.fixture,
    competitionName: r.competitionName,
    direction: r.fixture.ChallengerClubId === clubId ? 'outgoing' : 'incoming',
  }));
}

export const ChallengeService = {
  findSlot,
  eligibleOpponents,
  propose,
  accept,
  decline,
  cancel,
  expireChallenges,
  clubChallenges,
  declinesSoFar,
};
