import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  max,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import type {
  CompetitionDefinition,
  LeagueRules,
  StageDefinition,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  awards,
  calendars,
  clubs,
  competitionAccess,
  competitions,
  entries,
  fixtures,
  levelHistory,
  rankings,
  seasons,
  transferLedger,
} from '../../db/drizzle/schema';
import { levelForXp, xpAfterLevelChange } from '../world/level';
import {
  buildDefinition,
  resolveLeagueRules,
  type DefinitionResult,
} from './definition';
import { rankRows, type RankedRow, type RankingRow } from './ranking';
import { initStageRows } from './ranking.service';

/**
 * Edition lifecycle for open-play competitions
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Edition lifecycle"):
 *
 *   draft --publish--> (published draft) --opens--> registration
 *     --start day, >= minClubs--> running --last stage ends--> finished
 *   registration short of minClubs, or admin cancel --> cancelled
 *
 * An edition is a Seasons row. Publishing snapshots the competition's
 * definition into Seasons.Definition, so later edits to the competition
 * never change a published edition. Knockout rounds are drawn by the
 * knockout stage module (build step 6); this module opens and closes league
 * and groups stages and finishes editions.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];
type Season = typeof seasons.$inferSelect;
type Competition = typeof competitions.$inferSelect;

export class EditionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not-found'
      | 'invalid-definition'
      | 'wrong-status'
      | 'ineligible'
      | 'bad-dates'
      | 'not-supported',
    public readonly details?: unknown
  ) {
    super(message);
  }
}

/** Entry statuses that hold a place in an edition. */
const HOLDING = ['registered', 'active'];

async function world(tx: Tx | ReturnType<typeof db> = db()) {
  const [calendar] = await tx.select().from(calendars).limit(1);
  if (!calendar)
    throw new Error('No calendar row: the game world has not been set up');
  return calendar;
}

async function getSeason(
  tx: Tx | ReturnType<typeof db>,
  seasonId: string
): Promise<Season> {
  const [season] = await tx
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  if (!season)
    throw new EditionError(`Edition ${seasonId} not found`, 'not-found');
  return season;
}

function definitionOf(season: Season): CompetitionDefinition {
  if (!season.Definition) {
    throw new EditionError(
      `Edition ${season.SeasonCode} is not published`,
      'wrong-status'
    );
  }
  return season.Definition;
}

/** A competition row as a definition input (defaults filled, validated). */
export function competitionDefinition(
  competition: Competition
): DefinitionResult {
  return buildDefinition({
    Name: competition.Name,
    Description: competition.Description ?? undefined,
    Prestige: competition.Prestige,
    Entry: competition.Entry ?? undefined,
    Stages: competition.Stages ?? [],
    WinCondition: competition.WinCondition ?? undefined,
    Rewards: competition.Rewards ?? undefined,
    Outcomes: competition.Outcomes ?? undefined,
    Recurrence: competition.Recurrence ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Create / publish / cancel
// ---------------------------------------------------------------------------

export interface EditionDates {
  registrationOpensDay: number;
  registrationClosesDay: number;
  startDay: number;
}

function checkDates(d: EditionDates, today: number) {
  if (
    d.registrationOpensDay > d.registrationClosesDay ||
    d.registrationClosesDay > d.startDay
  ) {
    throw new EditionError(
      'Dates must run registration opens <= registration closes <= start',
      'bad-dates'
    );
  }
  if (d.startDay < today)
    throw new EditionError('Start day is in the past', 'bad-dates');
}

/** New draft edition of a competition. */
export async function createEdition(
  competitionId: string,
  dates: EditionDates
): Promise<Season> {
  const today = (await world()).CurrentDay;
  checkDates(dates, today);

  return db().transaction(async (tx) => {
    const [competition] = await tx
      .select()
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .for('update');
    if (!competition)
      throw new EditionError(
        `Competition ${competitionId} not found`,
        'not-found'
      );

    const [{ last }] = await tx
      .select({ last: max(seasons.EditionNumber) })
      .from(seasons)
      .where(eq(seasons.CompetitionId, competitionId));
    const number = (last ?? 0) + 1;
    const code = `${competition.CompetitionCode.toUpperCase()}-E${number}`;
    const now = new Date();

    const [season] = await tx
      .insert(seasons)
      .values({
        SeasonCode: code,
        Title: `${competition.Name} #${number}`,
        // Real-world timestamps are informational only; game days drive everything.
        StartDate: now,
        EndDate: now,
        CompetitionId: competition.id,
        CompetitionCode: competition.CompetitionCode,
        EditionNumber: number,
        Status: 'draft',
        RegistrationOpensDay: dates.registrationOpensDay,
        RegistrationClosesDay: dates.registrationClosesDay,
        StartDay: dates.startDay,
        updatedAt: now,
      })
      .returning();
    return season!;
  });
}

/** Snapshot the competition's definition into the edition and invite any
 * clubs that qualified for it. Registration opens on its day (tickEditions). */
export async function publishEdition(seasonId: string): Promise<Season> {
  return db().transaction(async (tx) => {
    const season = await getSeason(tx, seasonId);
    if (season.Status !== 'draft' || season.Definition) {
      throw new EditionError(
        'Only an unpublished draft can be published',
        'wrong-status'
      );
    }
    const [competition] = await tx
      .select()
      .from(competitions)
      .where(eq(competitions.id, season.CompetitionId!));
    const built = competitionDefinition(competition!);
    if (!built.ok) {
      throw new EditionError(
        'Competition definition is invalid',
        'invalid-definition',
        built.errors
      );
    }

    const [updated] = await tx
      .update(seasons)
      .set({ Definition: built.definition, updatedAt: new Date() })
      .where(eq(seasons.id, seasonId))
      .returning();
    await inviteQualified(tx, updated!);
    return updated!;
  });
}

/** Turn pending 'qualified' access rows for this competition into invites. */
async function inviteQualified(tx: Tx, season: Season) {
  const pending = await tx
    .select()
    .from(competitionAccess)
    .where(
      and(
        eq(competitionAccess.CompetitionId, season.CompetitionId!),
        eq(competitionAccess.Kind, 'qualified'),
        eq(competitionAccess.Used, false)
      )
    );
  if (!pending.length) return;
  await tx
    .insert(entries)
    .values(
      pending.map((p) => ({
        SeasonId: season.id,
        ClubId: p.ClubId,
        Status: 'invited',
        updatedAt: new Date(),
      }))
    )
    .onConflictDoNothing();
  await tx
    .update(competitionAccess)
    .set({ Used: true })
    .where(
      inArray(
        competitionAccess.id,
        pending.map((p) => p.id)
      )
    );
}

async function refundFees(tx: Tx, season: Season, clubIds?: string[]) {
  const paid = await tx
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.SeasonId, season.id),
        sql`${entries.FeePaid} > 0`,
        clubIds ? inArray(entries.ClubId, clubIds) : undefined
      )
    );
  for (const entry of paid) {
    await tx
      .update(clubs)
      .set({
        Budget: sql`coalesce(${clubs.Budget}, 0) + ${entry.FeePaid}`,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, entry.ClubId));
    await tx.insert(transferLedger).values({
      Type: 'entry_refund',
      BuyerClubId: entry.ClubId,
      Amount: entry.FeePaid,
      Note: `${season.SeasonCode}: entry fee refunded`,
      updatedAt: new Date(),
    });
    await tx
      .update(entries)
      .set({ FeePaid: 0, updatedAt: new Date() })
      .where(eq(entries.id, entry.id));
  }
}

/** Cancel open challenges (and unplayed accepted ones) in an edition, for
 * one stage and/or one club. */
async function closeOpenChallenges(
  tx: Tx,
  seasonId: string,
  filter: { stageIndex?: number; clubId?: string }
) {
  const scope = and(
    eq(fixtures.SeasonId, seasonId),
    eq(fixtures.Played, false),
    filter.stageIndex != null
      ? eq(fixtures.StageIndex, filter.stageIndex)
      : undefined,
    filter.clubId
      ? or(
          eq(fixtures.HomeTeamId, filter.clubId),
          eq(fixtures.AwayTeamId, filter.clubId)
        )
      : undefined
  );
  await tx
    .update(fixtures)
    .set({ ChallengeStatus: 'expired', updatedAt: new Date() })
    .where(and(scope, eq(fixtures.ChallengeStatus, 'proposed')));
  await tx
    .update(fixtures)
    .set({
      ChallengeStatus: 'cancelled',
      ScheduledDay: null,
      ScheduledDate: null,
      updatedAt: new Date(),
    })
    .where(and(scope, eq(fixtures.ChallengeStatus, 'accepted')));
}

/** Admin cancel, or registration closing short of minClubs. Refunds fees. */
export async function cancelEdition(
  seasonId: string,
  reason = 'Cancelled by admin'
) {
  return db().transaction(async (tx) => {
    const season = await getSeason(tx, seasonId);
    if (season.Status === 'finished' || season.Status === 'cancelled') {
      throw new EditionError(
        `Edition is already ${season.Status}`,
        'wrong-status'
      );
    }
    await refundFees(tx, season);
    await closeOpenChallenges(tx, season.id, {});
    const today = (await world(tx)).CurrentDay;
    const [updated] = await tx
      .update(seasons)
      .set({
        Status: 'cancelled',
        EndDay: today,
        Logs: sql`${seasons.Logs} || ${JSON.stringify([{ title: 'Cancelled', content: reason }])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, seasonId))
      .returning();
    return updated!;
  });
}

// ---------------------------------------------------------------------------
// Eligibility and entries
// ---------------------------------------------------------------------------

export interface Eligibility {
  eligible: boolean;
  /** Human-readable reasons it can't enter (empty when eligible). */
  reasons: string[];
  fee: number;
}

/**
 * Whether a club may register for an edition right now. Invited clubs (by
 * the admin or by qualifying) skip the Level/Elo/rating/country bands; the
 * entry cap and the fee still apply to everyone.
 */
export async function checkEligibility(
  seasonId: string,
  clubId: string
): Promise<Eligibility> {
  return eligibility(db(), seasonId, clubId);
}

async function eligibility(
  tx: Tx | ReturnType<typeof db>,
  seasonId: string,
  clubId: string
): Promise<Eligibility> {
  const season = await getSeason(tx, seasonId);
  const calendar = await world(tx);
  const reasons: string[] = [];
  const def = season.Definition;
  const entry = def?.Entry;
  const fee = entry?.entryFee ?? 0;

  const [club] = await tx.select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new EditionError(`Club ${clubId} not found`, 'not-found');
  if (!def || !entry)
    return { eligible: false, reasons: ['Not open for entry yet'], fee };

  const [existing] = await tx
    .select()
    .from(entries)
    .where(and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, clubId)));
  const invited = existing?.Status === 'invited';
  if (
    existing &&
    existing.Status !== 'invited' &&
    existing.Status !== 'withdrawn'
  ) {
    reasons.push('Already entered');
  }

  // Status and timing.
  const firstStage = def.Stages[0];
  const lateOk =
    season.Status === 'running' &&
    season.CurrentStage === 0 &&
    firstStage?.type !== 'knockout' &&
    entry.lateEntryUntilDay != null &&
    calendar.CurrentDay <= (season.StartDay ?? 0) + entry.lateEntryUntilDay;
  if (season.Status !== 'registration' && !lateOk)
    reasons.push('Registration is closed');

  // Places.
  if (entry.maxClubs != null) {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(entries)
      .where(
        and(eq(entries.SeasonId, seasonId), inArray(entries.Status, HOLDING))
      );
    if (n >= entry.maxClubs) reasons.push('No places left');
  }

  // Invite-only.
  if (entry.mode === 'invite' && !invited) reasons.push('Invitation only');

  // Bands (skipped for invited clubs).
  if (!invited) {
    const level = levelForXp(club.XP, calendar.LevelThresholds ?? undefined);
    if (entry.minLevel != null && level < entry.minLevel)
      reasons.push(`Needs Level ${entry.minLevel}+`);
    if (entry.maxLevel != null && level > entry.maxLevel)
      reasons.push(`Only up to Level ${entry.maxLevel}`);
    if (entry.minElo != null && club.Elo < entry.minElo)
      reasons.push(`Needs Elo ${entry.minElo}+`);
    if (entry.maxElo != null && club.Elo > entry.maxElo)
      reasons.push(`Only up to Elo ${entry.maxElo}`);
    if (entry.minRating != null && club.Rating < entry.minRating)
      reasons.push(`Needs rating ${entry.minRating}+`);
    if (entry.maxRating != null && club.Rating > entry.maxRating)
      reasons.push(`Only up to rating ${entry.maxRating}`);
    if (
      entry.countryIds?.length &&
      !entry.countryIds.includes(club.AddressCountryId ?? '')
    ) {
      reasons.push('Not open to clubs from your country');
    }
    if (entry.requiresWinOf?.length) {
      const wins = await tx
        .select({ id: seasons.id })
        .from(seasons)
        .where(
          and(
            inArray(seasons.CompetitionId, entry.requiresWinOf),
            eq(seasons.WinnerId, clubId)
          )
        )
        .limit(1);
      if (!wins.length) reasons.push('Only for past winners');
    }
  }

  // Can't be in these competitions at the same time.
  if (entry.excludesEntrantsOf?.length) {
    const clash = await tx
      .select({ id: entries.id })
      .from(entries)
      .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
      .where(
        and(
          eq(entries.ClubId, clubId),
          inArray(entries.Status, HOLDING),
          inArray(seasons.CompetitionId, entry.excludesEntrantsOf),
          inArray(seasons.Status, ['registration', 'running'])
        )
      )
      .limit(1);
    if (clash.length)
      reasons.push('Already in a competition that excludes this one');
  }

  // Barred by an outcome.
  const bars = await tx
    .select()
    .from(competitionAccess)
    .where(
      and(
        eq(competitionAccess.ClubId, clubId),
        eq(competitionAccess.CompetitionId, season.CompetitionId!),
        eq(competitionAccess.Kind, 'barred'),
        gte(competitionAccess.UntilEditionNumber, season.EditionNumber ?? 0)
      )
    )
    .limit(1);
  if (bars.length) reasons.push('Barred from this competition for now');

  // Entry cap across all competitions.
  const [{ current }] = await tx
    .select({ current: sql<number>`count(*)::int` })
    .from(entries)
    .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
    .where(
      and(
        eq(entries.ClubId, clubId),
        inArray(entries.Status, HOLDING),
        inArray(seasons.Status, ['registration', 'running']),
        ne(entries.SeasonId, seasonId)
      )
    );
  if (current >= calendar.MaxConcurrentEntries) {
    reasons.push(
      `Entry limit reached (${current} / ${calendar.MaxConcurrentEntries})`
    );
  }

  // Fee.
  if (fee > 0 && (club.Budget ?? 0) < fee)
    reasons.push("Can't afford the entry fee");

  return { eligible: reasons.length === 0, reasons, fee };
}

/** Register a club (or accept its invite). Takes the fee atomically. */
export async function register(seasonId: string, clubId: string) {
  return db().transaction(async (tx) => {
    // Serialise registrations per edition so the place count can't overshoot.
    await tx
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.id, seasonId))
      .for('update');
    const check = await eligibility(tx, seasonId, clubId);
    if (!check.eligible) {
      throw new EditionError(
        check.reasons.join('; '),
        'ineligible',
        check.reasons
      );
    }
    const season = await getSeason(tx, seasonId);

    if (check.fee > 0) {
      const debited = await tx
        .update(clubs)
        .set({
          Budget: sql`${clubs.Budget} - ${check.fee}`,
          updatedAt: new Date(),
        })
        .where(and(eq(clubs.id, clubId), gte(clubs.Budget, check.fee)))
        .returning({ id: clubs.id });
      if (!debited.length)
        throw new EditionError("Can't afford the entry fee", 'ineligible');
      await tx.insert(transferLedger).values({
        Type: 'entry_fee',
        SellerClubId: clubId,
        Amount: check.fee,
        Note: `${season.SeasonCode}: entry fee`,
        updatedAt: new Date(),
      });
    }

    // Late entries join the running first stage directly.
    const status = season.Status === 'running' ? 'active' : 'registered';
    const [entry] = await tx
      .insert(entries)
      .values({
        SeasonId: seasonId,
        ClubId: clubId,
        Status: status,
        FeePaid: check.fee,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [entries.SeasonId, entries.ClubId],
        set: { Status: status, FeePaid: check.fee, updatedAt: new Date() },
      })
      .returning();
    return entry!;
  });
}

/** Admin: invite clubs to an unstarted edition (invite mode, or anyone). */
export async function invite(seasonId: string, clubIds: string[]) {
  const season = await getSeason(db(), seasonId);
  if (season.Status !== 'draft' && season.Status !== 'registration') {
    throw new EditionError(
      'Invites are only possible before the edition starts',
      'wrong-status'
    );
  }
  if (!clubIds.length) return [];
  return db()
    .insert(entries)
    .values(
      clubIds.map((ClubId) => ({
        SeasonId: seasonId,
        ClubId,
        Status: 'invited',
        updatedAt: new Date(),
      }))
    )
    .onConflictDoNothing()
    .returning();
}

/** Decline an invite. */
export async function declineInvite(seasonId: string, clubId: string) {
  await db()
    .delete(entries)
    .where(
      and(
        eq(entries.SeasonId, seasonId),
        eq(entries.ClubId, clubId),
        eq(entries.Status, 'invited')
      )
    );
}

/** Withdraw a club. Before the start the fee is refunded; after it isn't,
 * and the club's open challenges are cancelled (its table row stays). */
export async function withdraw(seasonId: string, clubId: string) {
  return db().transaction(async (tx) => {
    const season = await getSeason(tx, seasonId);
    const [entry] = await tx
      .select()
      .from(entries)
      .where(and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, clubId)));
    if (!entry || !HOLDING.includes(entry.Status)) {
      throw new EditionError(
        'Club is not entered in this edition',
        'wrong-status'
      );
    }
    if (season.Status === 'registration' || season.Status === 'draft') {
      await refundFees(tx, season, [clubId]);
    } else if (season.Status === 'running') {
      await closeOpenChallenges(tx, seasonId, { clubId });
    } else {
      throw new EditionError(`Edition is ${season.Status}`, 'wrong-status');
    }
    await tx
      .update(entries)
      .set({ Status: 'withdrawn', updatedAt: new Date() })
      .where(eq(entries.id, entry.id));
  });
}

// ---------------------------------------------------------------------------
// Start and stages
// ---------------------------------------------------------------------------

/** Registration day reached: cancel short of minClubs, else start stage 0. */
export async function startEdition(seasonId: string): Promise<Season> {
  const season = await getSeason(db(), seasonId);
  if (season.Status !== 'registration') {
    throw new EditionError(
      'Only an edition in registration can start',
      'wrong-status'
    );
  }
  const def = definitionOf(season);
  const registered = await db()
    .select({ id: entries.id, ClubId: entries.ClubId, Elo: clubs.Elo })
    .from(entries)
    .innerJoin(clubs, eq(clubs.id, entries.ClubId))
    .where(
      and(eq(entries.SeasonId, seasonId), eq(entries.Status, 'registered'))
    )
    .orderBy(desc(clubs.Elo));

  if (registered.length < def.Entry.minClubs) {
    return cancelEdition(
      seasonId,
      `Only ${registered.length} of ${def.Entry.minClubs} clubs registered`
    );
  }

  const today = (await world()).CurrentDay;
  await db().transaction(async (tx) => {
    // Seed by Elo; unanswered invites lapse.
    for (const [i, e] of registered.entries()) {
      await tx
        .update(entries)
        .set({ Status: 'active', Seed: i + 1, updatedAt: new Date() })
        .where(eq(entries.id, e.id));
    }
    await tx
      .delete(entries)
      .where(
        and(eq(entries.SeasonId, seasonId), eq(entries.Status, 'invited'))
      );
    await tx
      .update(seasons)
      .set({
        Status: 'running',
        CurrentStage: 0,
        StageStartedDay: today,
        isStarted: true,
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, seasonId));
  });
  await openStage(seasonId, 0);
  return getSeason(db(), seasonId);
}

/** Group letters A, B, C... */
const groupName = (i: number) => String.fromCharCode(65 + i);

/** Elo pots with a snake draw: club i goes to group (i mod n), reversed on
 * every other pot, so each group gets one club from each strength band. */
export function drawGroups(
  clubIdsByElo: string[],
  groupSize: number
): Map<string, string> {
  const groupCount = Math.max(1, Math.ceil(clubIdsByElo.length / groupSize));
  const assignment = new Map<string, string>();
  clubIdsByElo.forEach((id, i) => {
    const pot = Math.floor(i / groupCount);
    const pos = i % groupCount;
    const group = pot % 2 === 0 ? pos : groupCount - 1 - pos;
    assignment.set(id, groupName(group));
  });
  return assignment;
}

async function openStage(seasonId: string, stageIndex: number) {
  const season = await getSeason(db(), seasonId);
  const stage = definitionOf(season).Stages[stageIndex];
  if (!stage)
    throw new Error(`Stage ${stageIndex} missing in ${season.SeasonCode}`);

  if (stage.type === 'knockout') {
    // Round draws live in the knockout module (build step 6).
    throw new EditionError(
      'Knockout stages are not available yet',
      'not-supported'
    );
  }

  if (stage.type === 'groups') {
    const active = await db()
      .select({ ClubId: entries.ClubId })
      .from(entries)
      .innerJoin(clubs, eq(clubs.id, entries.ClubId))
      .where(and(eq(entries.SeasonId, seasonId), eq(entries.Status, 'active')))
      .orderBy(desc(clubs.Elo), entries.ClubId);
    const draw = drawGroups(
      active.map((a) => a.ClubId),
      stage.groupSize
    );
    for (const [clubId, group] of draw) {
      await db()
        .update(entries)
        .set({ Group: group, updatedAt: new Date() })
        .where(and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, clubId)));
    }
  } else {
    await db()
      .update(entries)
      .set({ Group: null, updatedAt: new Date() })
      .where(eq(entries.SeasonId, seasonId));
  }
  await initStageRows(seasonId, stageIndex);
}

async function stageRows(seasonId: string, stageIndex: number) {
  return db()
    .select()
    .from(rankings)
    .where(
      and(eq(rankings.SeasonId, seasonId), eq(rankings.StageIndex, stageIndex))
    );
}

function rulesFor(
  stage: StageDefinition,
  worldDefaults: Partial<LeagueRules> | null
) {
  return resolveLeagueRules(stage, worldDefaults);
}

/** Which clubs leave a league/groups stage for the next one, best first. */
export function advancingClubs(
  stage: Extract<StageDefinition, { type: 'league' | 'groups' }>,
  rows: RankingRow[],
  rules: LeagueRules
): string[] {
  const advance = stage.advance;
  if (!advance) return [];
  const eligible = (list: RankedRow[]) => list.filter((r) => r.rank != null);

  if (stage.type === 'groups' && advance.perGroup) {
    const byGroup = new Map<string, RankingRow[]>();
    for (const r of rows) {
      const g = r.Group ?? '';
      byGroup.set(g, [...(byGroup.get(g) ?? []), r]);
    }
    const tables = [...byGroup.keys()]
      .sort()
      .map((g) => eligible(rankRows(byGroup.get(g)!, rules)));
    const qualified: RankingRow[] = [];
    // Group winners first, then runners-up, and so on.
    for (let place = 0; place < advance.top; place++) {
      const atPlace = tables
        .map((t) => t[place]?.row)
        .filter((r): r is RankingRow => !!r);
      qualified.push(
        ...rankRows(atPlace, { ...rules, minGamesToRank: 0 }).map((r) => r.row)
      );
    }
    if (advance.bestRunnersUp) {
      const next = tables
        .map((t) => t[advance.top]?.row)
        .filter((r): r is RankingRow => !!r);
      qualified.push(
        ...rankRows(next, { ...rules, minGamesToRank: 0 })
          .slice(0, advance.bestRunnersUp)
          .map((r) => r.row)
      );
    }
    return qualified.map((r) => r.ClubId);
  }

  const n = advance.top + (advance.bestRunnersUp ?? 0);
  return eligible(rankRows(rows, rules))
    .slice(0, n)
    .map((r) => r.row.ClubId);
}

/** A league/groups stage's days are up: close its challenges, move the
 * qualifiers on, eliminate the rest; finish after the last stage. */
export async function endStage(seasonId: string): Promise<Season> {
  const season = await getSeason(db(), seasonId);
  if (season.Status !== 'running')
    throw new EditionError('Edition is not running', 'wrong-status');
  const def = definitionOf(season);
  const stageIndex = season.CurrentStage;
  const stage = def.Stages[stageIndex]!;
  if (stage.type === 'knockout') {
    throw new EditionError(
      'Knockout stages end when their final is played',
      'not-supported'
    );
  }
  const calendar = await world();
  const rules = rulesFor(stage, calendar.DefaultRules ?? null);

  await db().transaction(async (tx) =>
    closeOpenChallenges(tx, seasonId, { stageIndex })
  );

  const isLast = stageIndex === def.Stages.length - 1;
  if (isLast) return finishEdition(seasonId);

  const rows = await stageRows(seasonId, stageIndex);
  const through = advancingClubs(stage, rows, rules);
  await db().transaction(async (tx) => {
    await tx
      .update(entries)
      .set({
        Status: 'eliminated',
        EliminatedAtStage: stageIndex,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(entries.SeasonId, seasonId),
          eq(entries.Status, 'active'),
          through.length ? notInArray(entries.ClubId, through) : undefined
        )
      );
    // Seeds for the next stage follow this stage's order.
    for (const [i, clubId] of through.entries()) {
      await tx
        .update(entries)
        .set({ Seed: i + 1, updatedAt: new Date() })
        .where(and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, clubId)));
    }
    await tx
      .update(seasons)
      .set({
        CurrentStage: stageIndex + 1,
        StageStartedDay: calendar.CurrentDay,
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, seasonId));
  });
  await openStage(seasonId, stageIndex + 1);
  return getSeason(db(), seasonId);
}

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------

/**
 * Final order of every club that played: clubs in the last stage by its
 * table (groups merged: group winners, then runners-up...), then clubs
 * knocked out earlier, later stages first. `order` overrides it (the
 * knockout module passes the bracket order).
 */
async function finalOrder(
  season: Season,
  def: CompetitionDefinition,
  worldDefaults: Partial<LeagueRules> | null
) {
  const played = await db()
    .select({
      ClubId: entries.ClubId,
      Status: entries.Status,
      EliminatedAtStage: entries.EliminatedAtStage,
    })
    .from(entries)
    .where(
      and(
        eq(entries.SeasonId, season.id),
        inArray(entries.Status, ['active', 'eliminated', 'withdrawn'])
      )
    );

  const order: { clubId: string; ranked: boolean }[] = [];
  const seen = new Set<string>();
  const push = (clubId: string, ranked: boolean) => {
    if (seen.has(clubId)) return;
    seen.add(clubId);
    order.push({ clubId, ranked });
  };

  for (let s = def.Stages.length - 1; s >= 0; s--) {
    const stage = def.Stages[s]!;
    if (stage.type === 'knockout') continue;
    const rules = rulesFor(stage, worldDefaults);
    const rows = await stageRows(season.id, s);
    const stillIn = new Set(
      played
        .filter((p) =>
          s === season.CurrentStage
            ? p.Status !== 'eliminated'
            : p.EliminatedAtStage === s
        )
        .map((p) => p.ClubId)
    );
    const stageRowsIn = rows.filter((r) => stillIn.has(r.ClubId));
    const byGroup = new Map<string, RankingRow[]>();
    for (const r of stageRowsIn)
      byGroup.set(r.Group ?? '', [...(byGroup.get(r.Group ?? '') ?? []), r]);
    const tables = [...byGroup.keys()]
      .sort()
      .map((g) => rankRows(byGroup.get(g)!, rules));
    const depth = Math.max(0, ...tables.map((t) => t.length));
    for (let place = 0; place < depth; place++) {
      const atPlace = tables
        .map((t) => t[place])
        .filter((r): r is RankedRow => !!r);
      const ordered = rankRows(
        atPlace.map((r) => r.row),
        { ...rules, minGamesToRank: 0 }
      );
      for (const r of ordered) {
        const ranked =
          atPlace.find((a) => a.row.ClubId === r.row.ClubId)!.rank != null;
        push(r.row.ClubId, ranked);
      }
    }
  }
  for (const p of played) push(p.ClubId, false);
  return order;
}

/** Edition-wide totals (all stages) for best-at-end win conditions. */
async function editionTotals(seasonId: string): Promise<RankingRow[]> {
  const rows = await db()
    .select()
    .from(rankings)
    .where(eq(rankings.SeasonId, seasonId));
  const total = new Map<string, RankingRow>();
  for (const r of rows) {
    const t = total.get(r.ClubId);
    if (!t) {
      total.set(r.ClubId, { ...r, Group: null });
      continue;
    }
    for (const k of [
      'Played',
      'Wins',
      'Draws',
      'Losses',
      'GF',
      'GA',
      'GD',
      'Points',
      'CleanSheets',
      'Forfeits',
    ] as const) {
      t[k] += r[k];
    }
    t.BestUnbeatenRun = Math.max(t.BestUnbeatenRun, r.BestUnbeatenRun);
    t.EloStart = Math.min(t.EloStart, r.EloStart);
  }
  return [...total.values()];
}

export interface FinishOptions {
  /** A first-to target was reached by this club. */
  firstToWinner?: string;
  /** Full final order, best first (knockout module). */
  order?: string[];
}

export interface FinishSummary {
  seasonId: string;
  winnerId: string | null;
  order: string[];
  nextEditionId: string | null;
}

export async function finishEdition(
  seasonId: string,
  options: FinishOptions = {}
): Promise<Season> {
  await finish(seasonId, options);
  return getSeason(db(), seasonId);
}

/** Decide the winner, pay rewards, apply outcomes, schedule the next
 * edition. Runs once: the status flip to 'finished' is the guard. */
export async function finish(
  seasonId: string,
  options: FinishOptions = {}
): Promise<FinishSummary | null> {
  const season = await getSeason(db(), seasonId);
  if (season.Status !== 'running') return null;
  const def = definitionOf(season);
  const calendar = await world();
  const worldDefaults = calendar.DefaultRules ?? null;
  const today = calendar.CurrentDay;

  // Order and winner.
  let order = options.order
    ? options.order.map((clubId) => ({ clubId, ranked: true }))
    : await finalOrder(season, def, worldDefaults);

  const win = def.WinCondition;
  if (win.type === 'best-at-end') {
    const lastLeague = [...def.Stages]
      .reverse()
      .find((s) => s.type !== 'knockout');
    const rules = lastLeague ? rulesFor(lastLeague, worldDefaults) : undefined;
    const totals = rankRows(await editionTotals(seasonId), {
      metric: win.metric,
      tiebreakers: rules?.tiebreakers ?? ['gd', 'gf', 'wins'],
      minGamesToRank: rules?.minGamesToRank ?? 0,
    });
    order = totals.map((t) => ({
      clubId: t.row.ClubId,
      ranked: t.rank != null,
    }));
  }
  if (options.firstToWinner) {
    order = [
      { clubId: options.firstToWinner, ranked: true },
      ...order.filter((o) => o.clubId !== options.firstToWinner),
    ];
  }
  // Unranked clubs can't win.
  const winnerId = order.find((o) => o.ranked)?.clubId ?? null;

  const nextEditionId = await db().transaction(async (tx) => {
    const flipped = await tx
      .update(seasons)
      .set({
        Status: 'finished',
        isFinished: true,
        EndDay: today,
        WinnerId: winnerId,
        updatedAt: new Date(),
      })
      .where(and(eq(seasons.id, seasonId), eq(seasons.Status, 'running')))
      .returning({ id: seasons.id });
    if (!flipped.length) return undefined;

    await closeOpenChallenges(tx, seasonId, {});

    // Rewards by position.
    const positionOf = new Map(order.map((o, i) => [o.clubId, i + 1]));
    for (const [clubId, position] of positionOf) {
      const prize =
        def.Rewards.prizeMoney.find((p) => p.position === position)?.amount ??
        0;
      if (prize > 0) {
        await tx
          .update(clubs)
          .set({
            Budget: sql`coalesce(${clubs.Budget}, 0) + ${prize}`,
            updatedAt: new Date(),
          })
          .where(eq(clubs.id, clubId));
        await tx.insert(transferLedger).values({
          Type: 'prize',
          BuyerClubId: clubId,
          Amount: prize,
          Note: `${season.SeasonCode}: ${def.Name} - position ${position}`,
          updatedAt: new Date(),
        });
      }
      const xp =
        def.Rewards.xp.find((p) => p.position === position)?.amount ?? 0;
      if (xp > 0)
        await addXp(
          tx,
          clubId,
          xp,
          'xp',
          today,
          seasonId,
          calendar.LevelThresholds
        );
    }

    if (winnerId) {
      if (def.Rewards.eloBonus) {
        await tx
          .update(clubs)
          .set({
            Elo: sql`${clubs.Elo} + ${def.Rewards.eloBonus}`,
            updatedAt: new Date(),
          })
          .where(eq(clubs.id, winnerId));
      }
      if (def.Rewards.trophy) {
        await tx.insert(awards).values({
          Name: def.Rewards.trophy,
          Type: 'club',
          Period: season.SeasonCode,
          Category: 'trophy',
          RecipientId: winnerId,
          ClubId: winnerId,
          SeasonId: seasonId,
          updatedAt: new Date(),
        });
      }
    }

    // Outcomes.
    const ranked = new Set(order.filter((o) => o.ranked).map((o) => o.clubId));
    const at = ([from, to]: [number, number]) =>
      order.slice(from - 1, to).map((o) => o.clubId);
    for (const outcome of def.Outcomes ?? []) {
      const clubsAt = at(outcome.positions);
      if (outcome.type === 'qualify') {
        const target = outcome.targetCompetitionId;
        const open = await nextOpenEdition(tx, target);
        for (const clubId of clubsAt.filter((c) => ranked.has(c))) {
          if (open) {
            await tx
              .insert(entries)
              .values({
                SeasonId: open.id,
                ClubId: clubId,
                Status: 'invited',
                updatedAt: new Date(),
              })
              .onConflictDoNothing();
          } else {
            await tx.insert(competitionAccess).values({
              ClubId: clubId,
              CompetitionId: target,
              Kind: 'qualified',
              SourceSeasonId: seasonId,
            });
          }
        }
      } else if (outcome.type === 'bar') {
        const [{ last }] = await tx
          .select({ last: max(seasons.EditionNumber) })
          .from(seasons)
          .where(
            and(
              eq(seasons.CompetitionId, outcome.targetCompetitionId),
              inArray(seasons.Status, ['running', 'finished', 'cancelled'])
            )
          );
        for (const clubId of clubsAt) {
          await tx.insert(competitionAccess).values({
            ClubId: clubId,
            CompetitionId: outcome.targetCompetitionId,
            Kind: 'barred',
            UntilEditionNumber: (last ?? 0) + outcome.editions,
            SourceSeasonId: seasonId,
          });
        }
      } else {
        // Level: promotion needs a Rank; relegation doesn't.
        const targets =
          outcome.change === 1 ? clubsAt.filter((c) => ranked.has(c)) : clubsAt;
        for (const clubId of targets) {
          await changeLevel(
            tx,
            clubId,
            outcome.change,
            today,
            seasonId,
            calendar
          );
        }
      }
    }

    // Recurrence: schedule and publish the next edition.
    if (def.Recurrence && season.StartDay != null) {
      const start = Math.max(
        season.StartDay + def.Recurrence.everyDays,
        today + 1
      );
      const opens = Math.max(today, start - def.Recurrence.registrationDays);
      const [{ last }] = await tx
        .select({ last: max(seasons.EditionNumber) })
        .from(seasons)
        .where(eq(seasons.CompetitionId, season.CompetitionId!));
      const number = (last ?? 0) + 1;
      const [competition] = await tx
        .select()
        .from(competitions)
        .where(eq(competitions.id, season.CompetitionId!));
      const built = competitionDefinition(competition!);
      const [next] = await tx
        .insert(seasons)
        .values({
          SeasonCode: `${competition!.CompetitionCode.toUpperCase()}-E${number}`,
          Title: `${competition!.Name} #${number}`,
          StartDate: new Date(),
          EndDate: new Date(),
          CompetitionId: competition!.id,
          CompetitionCode: competition!.CompetitionCode,
          EditionNumber: number,
          Status: 'draft',
          RegistrationOpensDay: opens,
          RegistrationClosesDay: start,
          StartDay: start,
          // The competition's current definition if still valid, else this one.
          Definition: built.ok ? built.definition : def,
          updatedAt: new Date(),
        })
        .returning();
      await inviteQualified(tx, next!);
      return next!.id;
    }
    return null;
  });

  if (nextEditionId === undefined) return null;
  return {
    seasonId,
    winnerId,
    order: order.map((o) => o.clubId),
    nextEditionId,
  };
}

async function nextOpenEdition(tx: Tx, competitionId: string) {
  const [open] = await tx
    .select()
    .from(seasons)
    .where(
      and(
        eq(seasons.CompetitionId, competitionId),
        inArray(seasons.Status, ['draft', 'registration']),
        sql`${seasons.Definition} is not null`
      )
    )
    .orderBy(seasons.EditionNumber)
    .limit(1);
  return open;
}

async function addXp(
  tx: Tx,
  clubId: string,
  amount: number,
  source: string,
  day: number,
  seasonId: string,
  thresholds: number[] | null
) {
  const [club] = await tx
    .select({ XP: clubs.XP })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .for('update');
  if (!club) return;
  await setXp(
    tx,
    clubId,
    club.XP,
    club.XP + amount,
    source,
    day,
    seasonId,
    thresholds
  );
}

async function setXp(
  tx: Tx,
  clubId: string,
  before: number,
  after: number,
  source: string,
  day: number,
  seasonId: string | null,
  thresholds: number[] | null
) {
  await tx
    .update(clubs)
    .set({ XP: after, updatedAt: new Date() })
    .where(eq(clubs.id, clubId));
  const from = levelForXp(before, thresholds ?? undefined);
  const to = levelForXp(after, thresholds ?? undefined);
  if (from !== to || source !== 'xp') {
    await tx.insert(levelHistory).values({
      ClubId: clubId,
      Day: day,
      FromLevel: from,
      ToLevel: to,
      XPBefore: before,
      XPAfter: after,
      Source: source,
      SeasonId: seasonId,
    });
  }
}

/** Promotion (+1) or relegation (-1) by setting XP to the Level threshold;
 * at most one per club per year. */
async function changeLevel(
  tx: Tx,
  clubId: string,
  change: 1 | -1,
  day: number,
  seasonId: string,
  calendar: typeof calendars.$inferSelect
) {
  const already = await tx
    .select({ id: levelHistory.id })
    .from(levelHistory)
    .where(
      and(
        eq(levelHistory.ClubId, clubId),
        inArray(levelHistory.Source, ['promotion', 'relegation']),
        gte(levelHistory.Day, calendar.YearStartDay)
      )
    )
    .limit(1);
  if (already.length) return;

  const [club] = await tx
    .select({ XP: clubs.XP })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .for('update');
  if (!club) return;
  const thresholds = calendar.LevelThresholds ?? undefined;
  const after = xpAfterLevelChange(club.XP, change, thresholds);
  if (after === club.XP) return;
  await setXp(
    tx,
    clubId,
    club.XP,
    after,
    change === 1 ? 'promotion' : 'relegation',
    day,
    seasonId,
    calendar.LevelThresholds
  );
}

// ---------------------------------------------------------------------------
// Daily transitions
// ---------------------------------------------------------------------------

export interface TickReport {
  opened: string[];
  started: string[];
  cancelled: string[];
  stagesEnded: string[];
  finished: string[];
  errors: { seasonId: string; message: string }[];
}

/**
 * Move every edition along for `day` (the calendar clock calls this once
 * per day, before the day's matches). Each edition is handled on its own,
 * so one failure never blocks the rest.
 */
export async function tickEditions(day?: number): Promise<TickReport> {
  const today = day ?? (await world()).CurrentDay;
  const report: TickReport = {
    opened: [],
    started: [],
    cancelled: [],
    stagesEnded: [],
    finished: [],
    errors: [],
  };
  const attempt = async (seasonId: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      report.errors.push({
        seasonId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Published drafts whose registration opens today or earlier.
  const toOpen = await db()
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        eq(seasons.Status, 'draft'),
        sql`${seasons.Definition} is not null`,
        lte(seasons.RegistrationOpensDay, today)
      )
    );
  for (const { id } of toOpen) {
    await attempt(id, async () => {
      await db()
        .update(seasons)
        .set({ Status: 'registration', updatedAt: new Date() })
        .where(and(eq(seasons.id, id), eq(seasons.Status, 'draft')));
      report.opened.push(id);
    });
  }

  // Registration over: start or cancel.
  const toStart = await db()
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(eq(seasons.Status, 'registration'), lte(seasons.StartDay, today))
    );
  for (const { id } of toStart) {
    // Registration always gets at least one tick, even when it opens on the start day.
    if (report.opened.includes(id)) continue;
    await attempt(id, async () => {
      const s = await startEdition(id);
      (s.Status === 'cancelled' ? report.cancelled : report.started).push(id);
    });
  }

  // League/groups stages past their last day.
  const running = await db()
    .select()
    .from(seasons)
    .where(and(eq(seasons.Status, 'running'), isNull(seasons.EndDay)));
  for (const s of running) {
    const stage = s.Definition?.Stages[s.CurrentStage];
    if (!stage || stage.type === 'knockout' || s.StageStartedDay == null)
      continue;
    if (today < s.StageStartedDay + stage.days) continue;
    await attempt(s.id, async () => {
      const after = await endStage(s.id);
      report.stagesEnded.push(s.id);
      if (after.Status === 'finished') report.finished.push(s.id);
    });
  }

  return report;
}

export const EditionService = {
  createEdition,
  publishEdition,
  cancelEdition,
  checkEligibility,
  register,
  invite,
  declineInvite,
  withdraw,
  startEdition,
  endStage,
  finishEdition,
  finish,
  tickEditions,
};
