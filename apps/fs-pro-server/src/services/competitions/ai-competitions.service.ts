import { and, avg, count, eq, gte, inArray } from 'drizzle-orm';
import type { ChallengePolicy, EntryPolicy } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  calendars,
  clubs,
  entries,
  fixtures,
  players,
  seasons,
} from '../../db/drizzle/schema';
import { resolveLeagueRules } from './definition';
import {
  accept,
  ChallengeError,
  decline,
  declinesSoFar,
  eligibleOpponents,
  propose,
} from './challenge.service';
import { checkEligibility, register } from './edition.service';

/**
 * Daily competition decisions for clubs nobody is steering right now
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "AI clubs" and "Human clubs"):
 *
 * - AI clubs (no owner) register for editions, answer challenges and send
 *   challenges to keep pace in their stages.
 * - Human clubs act only through their own policies: auto-accept
 *   (Clubs.ChallengePolicy) and auto-register (Clubs.EntryPolicy).
 *
 * Deterministic heuristics with a little randomness (`rng`, injectable for
 * tests); no LLM calls.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Rng = () => number;
type Calendar = typeof calendars.$inferSelect;
type Club = typeof clubs.$inferSelect;
type Fixture = typeof fixtures.$inferSelect;

/** Below this average squad fitness an AI club turns challenges down. */
export const TIRED_SQUAD_FITNESS = 60;
/** An AI club won't pay a fee over this share of its budget. */
export const MAX_FEE_SHARE = 0.2;

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function squadFitness(clubId: string): Promise<number> {
  const [row] = await db()
    .select({ fitness: avg(players.Fitness) })
    .from(players)
    .where(and(eq(players.ClubId, clubId), eq(players.isRetired, false)));
  return row?.fitness == null ? 100 : Number(row.fitness);
}

export interface AiReport {
  registered: number;
  accepted: number;
  declined: number;
  proposed: number;
  policyAccepted: number;
  policyDeclined: number;
  policyRegistered: number;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** How well an edition suits a club, 0..1: Elo near the middle of the
 * edition's Elo band scores highest; no band = 1. */
export function suitability(
  elo: number,
  band: { minElo?: number; maxElo?: number }
): number {
  if (band.minElo == null || band.maxElo == null) return 1;
  const mid = (band.minElo + band.maxElo) / 2;
  const half = Math.max(1, (band.maxElo - band.minElo) / 2);
  return clamp(1 - Math.abs(elo - mid) / half, 0, 1);
}

async function holdingCounts(): Promise<Map<string, number>> {
  const rows = await db()
    .select({ clubId: entries.ClubId, n: count() })
    .from(entries)
    .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
    .where(
      and(
        inArray(entries.Status, ['registered', 'active']),
        inArray(seasons.Status, ['registration', 'running'])
      )
    )
    .groupBy(entries.ClubId);
  return new Map(rows.map((r) => [r.clubId, r.n]));
}

async function registrations(
  calendar: Calendar,
  allClubs: Club[],
  rng: Rng,
  report: AiReport
) {
  const open = await db()
    .select()
    .from(seasons)
    .where(eq(seasons.Status, 'registration'));
  if (!open.length) return;
  const holding = await holdingCounts();
  const entered = new Set(
    (
      await db()
        .select({ seasonId: entries.SeasonId, clubId: entries.ClubId })
        .from(entries)
        .where(
          inArray(
            entries.SeasonId,
            open.map((s) => s.id)
          )
        )
    ).map((e) => `${e.seasonId}|${e.clubId}`)
  );

  for (const club of shuffle(allClubs, rng)) {
    const policy = club.UserId
      ? (club.EntryPolicy as EntryPolicy | null)
      : null;
    if (club.UserId && !policy?.autoRegister) continue;
    const cap = Math.min(
      calendar.MaxConcurrentEntries,
      policy?.maxEntries ?? Infinity
    );

    for (const edition of shuffle(open, rng)) {
      if ((holding.get(club.id) ?? 0) >= cap) break;
      if (entered.has(`${edition.id}|${club.id}`)) continue;
      const entry = edition.Definition?.Entry;
      if (!entry) continue;
      const fee = entry.entryFee ?? 0;

      if (policy) {
        if (policy.maxFee != null && fee > policy.maxFee) continue;
        if (
          policy.competitionIds?.length &&
          !policy.competitionIds.includes(edition.CompetitionId ?? '')
        )
          continue;
      } else {
        if (fee > (club.Budget ?? 0) * MAX_FEE_SHARE) continue;
        // Keen on the last registration day, choosier before it.
        const lastDay =
          (edition.StartDay ?? calendar.CurrentDay) - 1 <= calendar.CurrentDay;
        const p = lastDay
          ? 1
          : 0.4 * (0.5 + 0.5 * suitability(club.Elo, entry));
        if (rng() >= p) continue;
      }

      const check = await checkEligibility(edition.id, club.id);
      if (!check.eligible) continue;
      try {
        await register(edition.id, club.id);
        holding.set(club.id, (holding.get(club.id) ?? 0) + 1);
        entered.add(`${edition.id}|${club.id}`);
        if (policy) report.policyRegistered++;
        else report.registered++;
      } catch {
        // Lost a race for the last place, or the fee moved: fine, try elsewhere.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Answering challenges
// ---------------------------------------------------------------------------

async function minDeclines(fixture: Fixture, calendar: Calendar) {
  const [season] = await db()
    .select()
    .from(seasons)
    .where(eq(seasons.id, fixture.SeasonId!));
  const stage = season?.Definition?.Stages[fixture.StageIndex ?? 0];
  if (!stage || stage.type === 'knockout') return 0;
  return resolveLeagueRules(stage, calendar.DefaultRules ?? null)
    .minDeclinesBeforeForfeit;
}

/** Try to accept; a club with no free day just leaves it (it may expire). */
async function tryAccept(fixture: Fixture) {
  try {
    await accept(fixture.id, fixture.HomeTeamId!);
    return true;
  } catch (err) {
    if (err instanceof ChallengeError) return false;
    throw err;
  }
}

/** An AI club answers a challenge it received. */
async function aiRespond(
  fixture: Fixture,
  me: Club,
  opponent: Club,
  calendar: Calendar,
  rng: Rng
) {
  const declines = await declinesSoFar(fixture.SeasonId!, me.id);
  const limit = await minDeclines(fixture, calendar);
  // Keep a one-decline buffer so an AI club never walks into a forfeit.
  const mayDecline = declines < limit - 1;

  let wants = true;
  if ((await squadFitness(me.id)) < TIRED_SQUAD_FITNESS) wants = false;
  else wants = rng() < clamp(0.85 - (opponent.Elo - me.Elo) / 1000, 0.5, 0.95);

  if (!wants && mayDecline) {
    await decline(fixture.id, me.id);
    return 'declined' as const;
  }
  return (await tryAccept(fixture)) ? ('accepted' as const) : ('left' as const);
}

/**
 * Apply a human club's auto-accept policy to one challenge it received:
 * accept if it fits, decline if it doesn't and the policy says so, else
 * leave it for the user. Also called the moment a challenge is proposed.
 */
export async function applyChallengePolicy(
  fixtureId: string
): Promise<'accepted' | 'declined' | 'left'> {
  const [fixture] = await db()
    .select()
    .from(fixtures)
    .where(eq(fixtures.id, fixtureId));
  if (!fixture || fixture.ChallengeStatus !== 'proposed') return 'left';
  const [me] = await db()
    .select()
    .from(clubs)
    .where(eq(clubs.id, fixture.HomeTeamId!));
  const policy = me?.ChallengePolicy as ChallengePolicy | null;
  if (!me?.UserId || !policy?.autoAccept) return 'left';
  const [opponent] = await db()
    .select()
    .from(clubs)
    .where(eq(clubs.id, fixture.AwayTeamId!));
  const [calendar] = await db().select().from(calendars).limit(1);

  let fits = true;
  if (
    policy.competitionIds?.length &&
    !policy.competitionIds.includes(fixture.CompetitionId ?? '')
  )
    fits = false;
  if (
    fits &&
    policy.maxEloGap != null &&
    Math.abs((opponent?.Elo ?? me.Elo) - me.Elo) > policy.maxEloGap
  ) {
    fits = false;
  }
  if (
    fits &&
    policy.minSquadFitness != null &&
    (await squadFitness(me.id)) < policy.minSquadFitness
  )
    fits = false;
  if (fits && policy.maxPerWeek != null) {
    const [{ n }] = await db()
      .select({ n: count() })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.HomeTeamId, me.id),
          inArray(fixtures.ChallengeStatus, ['accepted', 'played']),
          gte(fixtures.RespondBy, calendar!.CurrentDay - 7)
        )
      );
    if (n >= policy.maxPerWeek) fits = false;
  }

  if (fits) return (await tryAccept(fixture)) ? 'accepted' : 'left';
  if (policy.declineOutsidePolicy) {
    await decline(fixture.id, me.id);
    return 'declined';
  }
  return 'left';
}

async function responses(
  calendar: Calendar,
  byId: Map<string, Club>,
  rng: Rng,
  report: AiReport
) {
  const pending = await db()
    .select()
    .from(fixtures)
    .where(eq(fixtures.ChallengeStatus, 'proposed'))
    .orderBy(fixtures.ProposedAt);
  for (const f of pending) {
    const me = byId.get(f.HomeTeamId!);
    const opponent = byId.get(f.AwayTeamId!);
    if (!me || !opponent) continue;
    if (me.UserId) {
      const r = await applyChallengePolicy(f.id);
      if (r === 'accepted') report.policyAccepted++;
      if (r === 'declined') report.policyDeclined++;
      continue;
    }
    const r = await aiRespond(f, me, opponent, calendar, rng);
    if (r === 'accepted') report.accepted++;
    if (r === 'declined') report.declined++;
  }
}

// ---------------------------------------------------------------------------
// Sending challenges
// ---------------------------------------------------------------------------

/** Games a club should have committed to by now in a stage. */
export function paceTarget(
  rules: { maxGames: number | null; minGamesToRank: number },
  stageDays: number,
  dayOfStage: number
): number {
  const goal =
    rules.maxGames ?? Math.max(rules.minGamesToRank, Math.ceil(stageDays / 3));
  const elapsed = clamp(dayOfStage / stageDays, 0, 1);
  return Math.ceil(goal * elapsed);
}

async function proposals(
  calendar: Calendar,
  aiClubs: Club[],
  rng: Rng,
  report: AiReport
) {
  const running = await db()
    .select()
    .from(seasons)
    .where(eq(seasons.Status, 'running'));
  const aiIds = new Set(aiClubs.map((c) => c.id));

  for (const season of shuffle(running, rng)) {
    const stage = season.Definition?.Stages[season.CurrentStage];
    if (!stage || stage.type === 'knockout' || season.StageStartedDay == null)
      continue;
    const lastDay = season.StageStartedDay + stage.days - 1;
    if (calendar.CurrentDay >= lastDay) continue; // nothing could be scheduled any more
    const rules = resolveLeagueRules(stage, calendar.DefaultRules ?? null);
    const target = paceTarget(
      rules,
      stage.days,
      calendar.CurrentDay - season.StageStartedDay + 1
    );

    const active = await db()
      .select({ clubId: entries.ClubId })
      .from(entries)
      .where(
        and(eq(entries.SeasonId, season.id), eq(entries.Status, 'active'))
      );
    const stageFixtures = await db()
      .select({ home: fixtures.HomeTeamId, away: fixtures.AwayTeamId })
      .from(fixtures)
      .where(
        and(
          eq(fixtures.SeasonId, season.id),
          eq(fixtures.StageIndex, season.CurrentStage),
          inArray(fixtures.ChallengeStatus, [
            'proposed',
            'accepted',
            'played',
            'forfeited',
          ])
        )
      );

    for (const { clubId } of shuffle(active, rng)) {
      if (!aiIds.has(clubId)) continue;
      const committed = stageFixtures.filter(
        (f) => f.home === clubId || f.away === clubId
      ).length;
      if (committed >= target) continue;

      const options = (await eligibleOpponents(season.id, clubId)).filter(
        (o) => o.eligible
      );
      if (!options.length) continue;
      const me = aiClubs.find((c) => c.id === clubId)!;
      const closest = options
        .sort((a, b) => Math.abs(a.elo - me.Elo) - Math.abs(b.elo - me.Elo))
        .slice(0, 3);
      const pick = closest[Math.floor(rng() * closest.length)]!;
      try {
        const f = await propose(season.id, clubId, pick.clubId);
        stageFixtures.push({ home: f.HomeTeamId, away: f.AwayTeamId });
        report.proposed++;
        await applyChallengePolicy(f.id);
      } catch (err) {
        if (!(err instanceof ChallengeError)) throw err;
      }
    }
  }
}

/** The daily pass, run by the world day loop before today's matches. */
export async function runCompetitionAi(
  rng: Rng = Math.random
): Promise<AiReport> {
  const report: AiReport = {
    registered: 0,
    accepted: 0,
    declined: 0,
    proposed: 0,
    policyAccepted: 0,
    policyDeclined: 0,
    policyRegistered: 0,
  };
  const [calendar] = await db().select().from(calendars).limit(1);
  if (!calendar) return report;
  const allClubs = await db().select().from(clubs);
  const byId = new Map(allClubs.map((c) => [c.id, c]));
  const aiClubs = allClubs.filter((c) => !c.UserId);

  await registrations(calendar, allClubs, rng, report);
  // Answer before proposing, so today's new challenges get a day to be seen.
  await responses(calendar, byId, rng, report);
  await proposals(calendar, aiClubs, rng, report);
  return report;
}
