import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import {
  nextCupDay,
  type MatchPlan,
  type MatchPrep,
  type Matchday,
  type MatchdayFixture,
  type PlanPreview,
  type ScoutReport,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubAssets, clubMessages, clubs, fixtures, matchReplays, players } from '../../db/drizzle/schema';
import { createFixture } from '../../controllers/fixtures/fixture.service';
import { buildSimulateMatchRequest } from '../../jobs/buildSimulateMatchRequest';
import { publishClubEvent } from '../../realtime/world-events';
import { getStanding } from '../world/club-standing.service';
import { recordMatchForChallenge } from './challenge.service';
import { payClub } from './rewards';
import {
  NO_HALF_TIME,
  counterTo,
  parseSideTactic,
  planEffect,
  planTactic,
  styleKey,
  styleMatchup,
  type PlanTactic,
} from './plan-effects';

/**
 * Match day (docs/CORE-LOOP.md): the club's scheduled matches, booking a
 * match against a chosen opponent, and the match plan set in the days
 * before kick-off. A plan is stored on the fixture, in the side's
 * HomeTactic / AwayTactic text column (engine tactic JSON plus the plan),
 * and read back by play() for that side only.
 */

const db = () => DrizzleDatabase.getInstance().database;

const SIM_SERVICE_URL = (process.env.SIM_SERVICE_URL ?? 'http://127.0.0.1:5050').replace(/\/$/, '');
/** Engine runs per preview: enough for a steady percentage, cheap enough to ask often. */
const PREVIEW_RUNS = 40;
/** Booked matches a club may have waiting at once (CoC's army camps). */
export const MAX_BOOKINGS = 2;
const BOOKED_STAGE = 'booked';
/** Booked-match rewards: bigger than a PLAY friendly - it was a commitment. */
const BOOKED_XP = { win: 60, draw: 25, loss: 10 } as const;
const BOOKED_GATE_SHARE = { win: 0.8, draw: 0.3, loss: 0 } as const;
const BOOKED_MIN_WIN_CASH = 8_000;

const power = (rating: number | null | undefined) => Math.round((rating ?? 0) * 2.5);

export class PrepError extends Error {
  constructor(message: string, public status: 400 | 403 | 404 = 400) {
    super(message);
  }
}

// --- Reading fixtures ------------------------------------------------------------------

type FixtureRow = typeof fixtures.$inferSelect;

function kindOf(f: FixtureRow): MatchdayFixture['kind'] {
  if (f.Stage === BOOKED_STAGE) return 'booked';
  if (f.Stage === 'lg-match') return 'league';
  if (f.Stage === 'open-match') return 'challenge';
  if (f.SeasonId) return 'cup';
  return 'friendly';
}

const scores = (details: unknown) => {
  const d = (details ?? {}) as { HomeTeamScore?: number; AwayTeamScore?: number };
  return { home: Number(d.HomeTeamScore ?? 0), away: Number(d.AwayTeamScore ?? 0) };
};

async function world() {
  const [calendar] = await db().select().from(calendars).limit(1);
  if (!calendar) throw new PrepError('The game world has not been set up');
  return calendar;
}
type World = Awaited<ReturnType<typeof world>>;

function kickoff(f: FixtureRow, w: World) {
  const hour = f.KickoffHour ?? w.CupKickoffHour ?? 20;
  const day = f.ScheduledDay;
  const gameHours = day === null ? null : (day - w.CurrentDay) * 24 + (hour - w.CurrentHour);
  const startsInSeconds =
    gameHours === null || w.ClockMode !== 'live' ? null : Math.max(0, Math.round(gameHours * ((w.DayLengthMinutes * 60) / 24)));
  return { hour, startsInSeconds, passed: f.Played || (gameHours !== null && gameHours <= 0) };
}

async function toMatchday(rows: FixtureRow[], clubId: string, w: World): Promise<MatchdayFixture[]> {
  if (!rows.length) return [];
  const oppIds = [...new Set(rows.map((f) => (f.HomeTeamId === clubId ? f.AwayTeamId : f.HomeTeamId)).filter((x): x is string => !!x))];
  const opps = oppIds.length
    ? await db().select({ id: clubs.id, name: clubs.Name, code: clubs.ClubCode, rating: clubs.Rating, user: clubs.UserId }).from(clubs).where(inArray(clubs.id, oppIds))
    : [];
  const byId = new Map(opps.map((o) => [o.id, o]));
  const replays = await db()
    .select({ id: matchReplays.FixtureId })
    .from(matchReplays)
    .where(inArray(matchReplays.FixtureId, rows.map((r) => r.id)));
  const withReplay = new Set(replays.map((r) => r.id));
  return rows.map((f) => {
    const home = f.HomeTeamId === clubId;
    const oppId = (home ? f.AwayTeamId : f.HomeTeamId) ?? '';
    const o = byId.get(oppId);
    const { hour, startsInSeconds } = kickoff(f, w);
    const s = scores(f.Details);
    return {
      fixtureId: f.id,
      kind: kindOf(f),
      title: (f.Title ?? '').replace(/\s*\((Booked|Matchmade)\)$/, ''),
      home,
      opponent: { id: oppId, name: o?.name ?? '?', code: o?.code ?? '?', power: power(o?.rating), human: !!o?.user },
      day: f.ScheduledDay,
      kickoffHour: hour,
      startsInSeconds: f.Played ? null : startsInSeconds,
      played: f.Played,
      playedAt: f.PlayedAt?.toISOString() ?? null,
      score: f.Played ? { you: home ? s.home : s.away, them: home ? s.away : s.home } : null,
      planSet: !!parseSideTactic(home ? f.HomeTactic : f.AwayTactic)?.plan,
      hasReplay: withReplay.has(f.id),
    };
  });
}

const involves = (clubId: string) => or(eq(fixtures.HomeTeamId, clubId), eq(fixtures.AwayTeamId, clubId));

export async function getMatchday(clubId: string): Promise<Matchday> {
  const w = await world();
  const upcoming = await db()
    .select()
    .from(fixtures)
    .where(and(involves(clubId), eq(fixtures.Played, false), isNotNull(fixtures.ScheduledDay)))
    .orderBy(asc(fixtures.ScheduledDay), asc(fixtures.KickoffHour))
    .limit(10);
  const recent = await db()
    .select()
    .from(fixtures)
    .where(and(involves(clubId), eq(fixtures.Played, true), isNotNull(fixtures.ScheduledDay)))
    .orderBy(desc(fixtures.PlayedAt))
    .limit(8);
  const used = upcoming.filter((f) => f.Stage === BOOKED_STAGE && f.HomeTeamId === clubId).length;
  return {
    upcoming: await toMatchday(upcoming, clubId, w),
    recent: await toMatchday(recent, clubId, w),
    bookings: { used, max: MAX_BOOKINGS },
  };
}

async function myFixture(clubId: string, fixtureId: string) {
  const [f] = await db().select().from(fixtures).where(eq(fixtures.id, fixtureId));
  if (!f) throw new PrepError('Match not found', 404);
  if (f.HomeTeamId !== clubId && f.AwayTeamId !== clubId) throw new PrepError('Your club is not playing in this match', 403);
  return { f, home: f.HomeTeamId === clubId };
}

// --- Plans -----------------------------------------------------------------------------

type ClubRow = typeof clubs.$inferSelect;

/** The club's standing plan: its saved tactic and team sheet. */
export function clubDefaultPlan(club: ClubRow): MatchPlan {
  const t = (club.Tactic ?? {}) as Record<string, unknown>;
  const formation = String(t.formationName ?? '433');
  return {
    formation: (['433', '442', '4231', '352', '343', '532', '541', '4141', '451', '41212'].includes(formation) ? formation : '433') as MatchPlan['formation'],
    style: styleKey(t.styleName),
    sliders: (t.sliders as MatchPlan['sliders']) ?? {},
    startingXI: club.Lineup?.startingXI ?? [],
    bench: club.Lineup?.bench ?? [],
    halfTime: (t.halfTime as MatchPlan['halfTime']) ?? NO_HALF_TIME,
    training: 'none',
    teamTalk: 'calm',
  };
}

async function sidePlan(f: FixtureRow, home: boolean, club: ClubRow): Promise<{ plan: MatchPlan; saved: boolean }> {
  const stored = parseSideTactic(home ? f.HomeTactic : f.AwayTactic);
  if (stored?.plan) return { plan: stored.plan, saved: true };
  return { plan: clubDefaultPlan(club), saved: false };
}

async function tiers(clubId: string) {
  const rows = await db().select({ type: clubAssets.AssetType, level: clubAssets.Level }).from(clubAssets).where(eq(clubAssets.ClubId, clubId));
  const of = (t: string) => rows.find((r) => r.type === t)?.level ?? 0;
  return { trainingTier: of('training_ground'), scoutingTier: of('scouting'), medicalTier: of('medical_centre') };
}

async function squadOf(clubId: string) {
  const rows = await db()
    .select()
    .from(players)
    .where(and(eq(players.ClubId, clubId), eq(players.isSigned, true), eq(players.isRetired, false)));
  return rows
    .map((p) => ({
      id: p.id,
      name: `${p.FirstName?.[0] ?? ''}. ${p.LastName ?? ''}`.trim(),
      position: p.Position ?? '?',
      rating: Math.round(p.Rating ?? 0),
      fitness: Math.round(p.Fitness ?? 100),
      morale: p.MoraleValue ?? 60,
      injured: Number((p.Injury as { daysRemaining?: number } | null)?.daysRemaining) > 0,
    }))
    .sort((a, b) => b.rating - a.rating);
}

async function scoutReport(f: FixtureRow, home: boolean, scoutingTier: number): Promise<ScoutReport> {
  const oppId = (home ? f.AwayTeamId : f.HomeTeamId) ?? '';
  const [opp] = await db().select().from(clubs).where(eq(clubs.id, oppId));
  if (!opp) throw new PrepError('Opponent not found', 404);
  const theirs = await sidePlan(f, !home, opp);
  const standing = await getStanding(oppId).catch(() => null);
  const squad = await squadOf(oppId);
  // Deeper with a better Scouting Department.
  const style = scoutingTier >= 1 ? theirs.plan.style : null;
  const notes: string[] = [];
  if (scoutingTier >= 3 && Object.values(theirs.plan.halfTime).some(Boolean)) {
    const h = theirs.plan.halfTime;
    if (h.losing) notes.push(`If they're losing at half time they switch to ${label(h.losing)}.`);
    if (h.winning) notes.push(`If they're winning at half time they switch to ${label(h.winning)}.`);
  }
  if (scoutingTier === 0) notes.push('Build a Scouting Department to learn how they play.');
  else if (scoutingTier < 2) notes.push('A better Scouting Department names their key players.');
  const tired = squad.filter((p) => p.fitness < 75).length;
  if (scoutingTier >= 2 && tired >= 3) notes.push(`${tired} of their players are short of fitness.`);
  return {
    level: scoutingTier,
    power: power(opp.Rating),
    formation: theirs.plan.formation,
    style,
    counter: style ? counterTo(style) : null,
    keyPlayers: scoutingTier >= 2 ? squad.slice(0, 3).map((p) => ({ name: p.name, position: p.position, rating: p.rating })) : [],
    form: (standing?.form ?? []).slice(0, 5),
    notes,
  };
}

// Function replacement, not backreference tokens, so the source contains no
// currency-symbol token that could be mistaken for money (L13).
const label = (s: string) => s.replace(/([a-z])([A-Z])/g, (_m, a: string, b: string) => `${a} ${b}`);

export async function getMatchPrep(clubId: string, fixtureId: string): Promise<MatchPrep> {
  const { f, home } = await myFixture(clubId, fixtureId);
  const [club] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new PrepError('Club not found', 404);
  const w = await world();
  const [fixture] = await toMatchday([f], clubId, w);
  const { plan } = await sidePlan(f, home, club);
  const t = await tiers(clubId);
  return {
    fixture: fixture!,
    plan,
    locked: kickoff(f, w).passed,
    squad: await squadOf(clubId),
    scout: await scoutReport(f, home, t.scoutingTier),
    facilities: t,
    myPower: power(club.Rating),
  };
}

function checkPlan(plan: MatchPlan, squadIds: Set<string>) {
  const xi = plan.startingXI.filter(Boolean);
  if (new Set(xi).size !== xi.length) throw new PrepError('A player is picked twice');
  if ([...xi, ...plan.bench].some((id) => !squadIds.has(id))) throw new PrepError('Pick only players from your squad');
  if (xi.length && xi.length !== 11) throw new PrepError('Pick a full XI (or none, to use your saved team sheet)');
}

export async function saveMatchPlan(clubId: string, fixtureId: string, plan: MatchPlan, asDefault = false): Promise<MatchPrep> {
  const { f, home } = await myFixture(clubId, fixtureId);
  if (kickoff(f, await world()).passed) throw new PrepError('This match has kicked off: the plan is locked');
  const squad = await squadOf(clubId);
  checkPlan(plan, new Set(squad.map((p) => p.id)));
  const stored = JSON.stringify(planTactic(plan));
  await db()
    .update(fixtures)
    .set(home ? { HomeTactic: stored, updatedAt: new Date() } : { AwayTactic: stored, updatedAt: new Date() })
    .where(eq(fixtures.id, fixtureId));
  if (asDefault) {
    await db()
      .update(clubs)
      .set({
        Tactic: { formationName: plan.formation, styleName: plan.style, sliders: plan.sliders ?? {}, halfTime: plan.halfTime } as never,
        ...(plan.startingXI.length ? { Lineup: { startingXI: plan.startingXI, bench: plan.bench } } : {}),
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, clubId));
  }
  return getMatchPrep(clubId, fixtureId);
}

// --- Preview: the engine plays the plan a few dozen times -------------------------------------

export async function previewMatchPlan(clubId: string, fixtureId: string, plan: MatchPlan): Promise<PlanPreview> {
  const { f, home } = await myFixture(clubId, fixtureId);
  const squad = await squadOf(clubId);
  checkPlan(plan, new Set(squad.map((p) => p.id)));
  const oppId = (home ? f.AwayTeamId : f.HomeTeamId) ?? '';
  const [[me], [opp]] = await Promise.all([
    db().select().from(clubs).where(eq(clubs.id, clubId)),
    db().select().from(clubs).where(eq(clubs.id, oppId)),
  ]);
  if (!me || !opp) throw new PrepError('Club not found', 404);
  const theirs = await sidePlan(f, !home, opp);
  const mine = planTactic(plan);
  const theirTactic: PlanTactic = theirs.saved ? planTactic(theirs.plan) : (opp.Tactic as unknown as PlanTactic) ?? planTactic(theirs.plan);

  const base = await buildSimulateMatchRequest(
    `preview-${fixtureId}`,
    f.HomeTeamId!,
    f.AwayTeamId!,
    home ? { home: mine as never, away: theirTactic as never } : { home: theirTactic as never, away: mine as never },
    { fixtureType: f.Type ?? undefined, stage: f.Stage ?? undefined }
  );
  base.includeFrames = false;
  const batch = Array.from({ length: PREVIEW_RUNS }, (_, i) => ({ ...base, seed: `${base.seed}-${i}` }));

  const res = await fetch(`${SIM_SERVICE_URL}/sim/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) throw new PrepError('The assistant could not run the numbers right now - try again');
  const body = (await res.json()) as { results?: { ok?: boolean; match?: { Details?: { HomeTeamScore?: number; AwayTeamScore?: number } } }[] };
  let w = 0, d = 0, l = 0, gf = 0, ga = 0, n = 0;
  for (const r of body.results ?? []) {
    const det = r?.match?.Details;
    if (!r?.ok || !det) continue;
    const yours = Number(home ? det.HomeTeamScore : det.AwayTeamScore);
    const theirsGoals = Number(home ? det.AwayTeamScore : det.HomeTeamScore);
    n++;
    gf += yours;
    ga += theirsGoals;
    if (yours > theirsGoals) w++;
    else if (yours === theirsGoals) d++;
    else l++;
  }
  if (!n) throw new PrepError('The assistant could not run the numbers right now - try again');

  return {
    runs: n,
    win: w / n,
    draw: d / n,
    loss: l / n,
    goalsFor: gf / n,
    goalsAgainst: ga / n,
    factors: await planFactors(plan, { me, opp, home, squad, theirStyle: theirs.plan.style, scoutingTier: (await tiers(clubId)).scoutingTier }),
  };
}

async function planFactors(
  plan: MatchPlan,
  ctx: { me: ClubRow; opp: ClubRow; home: boolean; squad: Awaited<ReturnType<typeof squadOf>>; theirStyle: MatchPlan['style']; scoutingTier: number }
): Promise<PlanPreview['factors']> {
  const out: PlanPreview['factors'] = [];
  const myPower = power(ctx.me.Rating);
  const oppPower = power(ctx.opp.Rating);
  const gap = myPower - oppPower;
  out.push({
    label: 'Squad strength',
    tone: gap > 4 ? 'good' : gap < -4 ? 'bad' : 'neutral',
    detail: `Power ${myPower} vs ${oppPower}`,
  });
  if (ctx.home) out.push({ label: 'Home ground', tone: 'good', detail: 'Your crowd, your pitch' });
  if (ctx.scoutingTier >= 1) {
    const m = styleMatchup(plan.style, ctx.theirStyle);
    out.push({
      label: 'Style matchup',
      tone: m > 0 ? 'good' : m < 0 ? 'bad' : 'neutral',
      detail:
        m > 0
          ? `${label(plan.style)} counters their ${label(ctx.theirStyle)}`
          : m < 0
            ? `Their ${label(ctx.theirStyle)} counters your ${label(plan.style)}`
            : `${label(plan.style)} vs ${label(ctx.theirStyle)}: no edge either way`,
    });
  } else {
    out.push({ label: 'Style matchup', tone: 'neutral', detail: 'Unknown: build a Scouting Department to see how they play' });
  }
  const byId = new Map(ctx.squad.map((p) => [p.id, p]));
  const xi = (plan.startingXI.length ? plan.startingXI : ctx.me.Lineup?.startingXI ?? []).map((id) => byId.get(id)).filter(Boolean) as typeof ctx.squad;
  const injured = xi.filter((p) => p.injured).length;
  if (injured) out.push({ label: 'Injured starters', tone: 'bad', detail: `${injured} in your XI can't play: the engine will swap them out` });
  if (xi.length) {
    const fit = Math.round(xi.reduce((s, p) => s + p.fitness, 0) / xi.length);
    out.push({ label: 'Fitness', tone: fit >= 90 ? 'good' : fit < 78 ? 'bad' : 'neutral', detail: `Starters average ${fit}%` });
  }
  const morale = ctx.squad.length ? ctx.squad.reduce((s, p) => s + p.morale, 0) / ctx.squad.length : 60;
  const t = await tiers(ctx.me.id);
  out.push(...planEffect(plan, { myPower, oppPower, morale, trainingTier: t.trainingTier }).notes);
  const ht = plan.halfTime;
  if (ht.losing || ht.drawing || ht.winning) out.push({ label: 'Half-time orders', tone: 'good', detail: 'The staff will change approach at the break' });
  return out;
}

// --- Booking ---------------------------------------------------------------------------------

export async function bookMatch(clubId: string, opponentId: string): Promise<MatchdayFixture> {
  if (clubId === opponentId) throw new PrepError("You can't book a match against yourself");
  const [[me], [opp]] = await Promise.all([
    db().select().from(clubs).where(eq(clubs.id, clubId)),
    db().select().from(clubs).where(eq(clubs.id, opponentId)),
  ]);
  if (!me || !opp || opp.ReleasedAt) throw new PrepError('That club is not available', 404);
  if (me.UserId && opp.UserId === me.UserId) throw new PrepError('Book a match against another manager or an AI club');

  const pending = await db()
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(and(eq(fixtures.HomeTeamId, clubId), eq(fixtures.Stage, BOOKED_STAGE), eq(fixtures.Played, false)));
  if (pending.length >= MAX_BOOKINGS) throw new PrepError(`You already have ${MAX_BOOKINGS} matches booked - play those first`);

  // On a cup day, at least a full day out: time to prepare, for both sides.
  const w = await world();
  const year = { WeekTemplate: w.WeekTemplate, YearStartDay: w.YearStartDay, YearLengthDays: w.YearLengthDays };
  const busy = async (day: number) => {
    const [row] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(fixtures)
      .where(and(eq(fixtures.ScheduledDay, day), or(involves(clubId), involves(opponentId))));
    return (row?.n ?? 0) > 0;
  };
  let day = nextCupDay(year, w.CurrentDay + 1);
  for (let tries = 0; day !== null && tries < 6 && (await busy(day)); tries++) day = nextCupDay(year, day + 1);
  if (day === null) throw new PrepError('No free match day in the next few weeks');

  const fixture = await createFixture({
    Title: `${me.Name} vs ${opp.Name} (Booked)`,
    Home: me.ClubCode,
    Away: opp.ClubCode,
    HomeTeamId: me.id,
    AwayTeamId: opp.id,
    Type: 'friendly',
    Stage: BOOKED_STAGE,
    // Booked = an accepted challenge outside any competition; 'played' once settled.
    ChallengeStatus: 'accepted',
    ChallengerClubId: me.id,
    ProposedAt: new Date(),
    Played: false,
    SaveStats: true,
    ScheduledDay: day,
    KickoffHour: w.CupKickoffHour,
  } as never);
  const fixtureId = String((fixture as { _id?: string; id?: string })._id ?? (fixture as { id?: string }).id);

  if (opp.UserId) {
    // The other manager gets the same prep window.
    await db()
      .insert(clubMessages)
      .values({
        ClubId: opp.id,
        Kind: 'squad',
        Tone: 'neutral',
        Title: `${me.Name} booked a match at their ground`,
        Body: `Day ${day}, ${String(w.CupKickoffHour).padStart(2, '0')}:00. Set your match plan before kick-off, or your saved team sheet plays.`,
        updatedAt: new Date(),
      })
      .catch(() => undefined);
    publishClubEvent(opp.id, 'club:booked', { fixtureId, byName: me.Name, day });
  }

  const [row] = await db().select().from(fixtures).where(eq(fixtures.id, fixtureId));
  const [view] = await toMatchday([row!], clubId, w);
  return view!;
}

/** Pay out a booked match once it has been played (called by the matchday
 * runner). Idempotent: ChallengeStatus moves from 'accepted' to 'played'. */
export async function settleBookedMatch(fixtureId: string) {
  const [f] = await db()
    .update(fixtures)
    .set({ ChallengeStatus: 'played', updatedAt: new Date() })
    .where(and(eq(fixtures.id, fixtureId), eq(fixtures.Stage, BOOKED_STAGE), eq(fixtures.Played, true), ne(fixtures.ChallengeStatus, 'played')))
    .returning();
  if (!f?.HomeTeamId || !f.AwayTeamId) return;
  const s = scores(f.Details);
  const homeOutcome = s.home > s.away ? 'win' : s.home < s.away ? 'loss' : 'draw';
  const awayOutcome = s.home < s.away ? 'win' : s.home > s.away ? 'loss' : 'draw';
  const [host] = await db().select().from(clubs).where(eq(clubs.id, f.HomeTeamId));
  const entry = ((host?.Finances as { history?: { fixtureId: string; net: number }[] } | null)?.history ?? []).find((h) => h.fixtureId === f.id);
  const gate = entry?.net ?? 0;
  const cash = homeOutcome === 'win' ? Math.max(Math.round(gate * BOOKED_GATE_SHARE.win), BOOKED_MIN_WIN_CASH) : Math.round(Math.max(gate, 0) * BOOKED_GATE_SHARE[homeOutcome]);
  await payClub(f.HomeTeamId, { cash, xp: BOOKED_XP[homeOutcome] }, 'match_reward', `Booked: ${f.Title ?? ''} ${s.home}-${s.away}`);
  await recordMatchForChallenge(f.HomeTeamId, homeOutcome === 'win').catch(() => undefined);
  const [away] = await db().select({ user: clubs.UserId }).from(clubs).where(eq(clubs.id, f.AwayTeamId));
  if (away?.user) {
    await payClub(f.AwayTeamId, { cash: 0, xp: BOOKED_XP[awayOutcome] }, 'match_reward', `Booked: ${f.Title ?? ''} ${s.home}-${s.away}`);
  }
  for (const [clubId, outcome, yours, theirs] of [
    [f.HomeTeamId, homeOutcome, s.home, s.away],
    [f.AwayTeamId, awayOutcome, s.away, s.home],
  ] as const) {
    publishClubEvent(clubId, 'club:match-played', { fixtureId: f.id, score: `${yours}-${theirs}`, outcome });
  }
}
