import { and, avg, desc, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubMessages, clubs, players, type ClubForm } from '../../db/drizzle/schema';
import { getAssetEffects } from '../facilities/facilities.service';

/**
 * A club's standing in the world - Fans, Reputation, BoardConfidence, Form
 * and squad morale - and the one place results move it.
 *
 * applyMatchOutcome is called from exactly one seam: game/functions.ts's
 * updateFixture, which both league matchdays and PLAY matches flow through.
 * Don't add a second call site, or results get counted twice.
 *
 * Every move is bounded per match and morale mean-reverts, so a losing run
 * hurts without becoming a death spiral (morale -> worse results -> morale).
 */

const db = () => DrizzleDatabase.getInstance().database;

export type Result = 'W' | 'D' | 'L';

const FORM_LENGTH = 10;
const MORALE_NEUTRAL = 60;
const MORALE_MIN = 20;
const MORALE_MAX = 95;
const FANS_FLOOR = 100;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function nextForm(form: ClubForm | null | undefined, result: Result): ClubForm {
  const recent = [result, ...(form?.recent ?? [])].slice(0, FORM_LENGTH);
  let n = 0;
  while (n < recent.length && recent[n] === recent[0]) n++;
  return { recent, streak: { type: recent[0], length: n } };
}

/** -1 (lost the last 5) .. +1 (won the last 5). */
export function formScore(form: ClubForm | null | undefined): number {
  const last5 = (form?.recent ?? []).slice(0, 5);
  if (!last5.length) return 0;
  const w = last5.filter((r) => r === 'W').length;
  const l = last5.filter((r) => r === 'L').length;
  return (w - l) / 5;
}

/** Extra swing for a run of 3+ of the same result, capped. */
const streakBonus = (form: ClubForm, perMatch: number, cap: number) => {
  const s = form.streak;
  if (!s || s.type === 'D' || s.length < 3) return 0;
  return Math.min((s.length - 2) * perMatch, cap) * (s.type === 'W' ? 1 : -1);
};

/**
 * Starting standing for a club that has none yet (Fans and Reputation both
 * 0): Fans from its stadium size and quality, Reputation from its Rating.
 * Idempotent - clubs that already have standing are left alone.
 */
export async function ensureStanding(clubId: string) {
  const [club] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');
  if (club.Fans > 0 || club.Reputation > 0) return club;

  const capacity = (await getAssetEffects(clubId)).capacity ?? 1000;
  const quality = clamp((club.Rating - 64) / 14, 0, 1);
  const [seeded] = await db()
    .update(clubs)
    .set({
      Fans: Math.max(Math.round(capacity * (0.7 + 0.8 * quality)), FANS_FLOOR),
      Reputation: clamp(Math.round(10 + (club.Rating - 60) * 4), 5, 95),
      BoardConfidence: 60,
      updatedAt: new Date(),
    })
    .where(eq(clubs.id, clubId))
    .returning();
  return seeded;
}

interface Crossing {
  kind: 'fans' | 'board' | 'squad';
  tone: 'good' | 'bad';
  title: string;
  body: string;
}

/** Inbox messages for the moments worth telling the owner about: a streak
 * reaching 3 or 5, and board confidence crossing a line. Not every match. */
function messagesFor(
  name: string,
  form: ClubForm,
  boardBefore: number,
  boardAfter: number,
  fansDelta: number
): Crossing[] {
  const out: Crossing[] = [];
  const s = form.streak;
  if (s && (s.length === 3 || s.length === 5)) {
    if (s.type === 'L') {
      out.push({
        kind: 'fans',
        tone: 'bad',
        title: s.length === 5 ? 'Supporters are staying away' : 'Grumbling in the stands',
        body:
          s.length === 5
            ? `Five defeats in a row. ${Math.abs(fansDelta).toLocaleString()} fans drifted away after the last one, and the stands are noticeably emptier.`
            : `Three straight losses and the supporters are losing patience with ${name}. Expect thinner crowds until results turn.`,
      });
      out.push({
        kind: 'squad',
        tone: 'bad',
        title: 'Dressing room low',
        body: 'The players are down after this run. Morale is dragging on performances.',
      });
    } else if (s.type === 'W') {
      out.push({
        kind: 'fans',
        tone: 'good',
        title: s.length === 5 ? 'The whole town is talking about us' : 'The buzz is building',
        body:
          s.length === 5
            ? `Five wins on the bounce. ${fansDelta.toLocaleString()} new supporters joined after the last one.`
            : `Three wins in a row and ${name} fans are starting to believe. Crowds are growing.`,
      });
    }
  }
  const crossedDown = (line: number) => boardBefore >= line && boardAfter < line;
  const crossedUp = (line: number) => boardBefore < line && boardAfter >= line;
  if (crossedDown(20)) {
    out.push({
      kind: 'board',
      tone: 'bad',
      title: 'Your position is under review',
      body: 'The board has lost faith in the current direction. Budget requests will be refused until results improve.',
    });
  } else if (crossedDown(35)) {
    out.push({
      kind: 'board',
      tone: 'bad',
      title: 'The board is concerned',
      body: 'The board has noticed the recent results. Requests for extra transfer funds will be treated with caution.',
    });
  } else if (crossedUp(80)) {
    out.push({
      kind: 'board',
      tone: 'good',
      title: 'The board is delighted',
      body: 'The directors are thrilled with recent results and are open to backing you in the market.',
    });
  }
  return out;
}

export interface MatchOutcomeInput {
  goalsFor: number;
  goalsAgainst: number;
  opponentReputation: number;
}

export interface StandingChange {
  fans: { before: number; after: number };
  reputation: { before: number; after: number };
  boardConfidence: { before: number; after: number };
  moraleDelta: number;
  form: ClubForm;
}

/** Moves one club's standing after one result. */
export async function applyMatchOutcome(
  clubId: string,
  input: MatchOutcomeInput
): Promise<StandingChange> {
  const club = await ensureStanding(clubId);
  const { goalsFor, goalsAgainst, opponentReputation } = input;
  const result: Result = goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
  const form = nextForm(club.Form, result);

  // Beating a bigger club (or losing to a smaller one) swings more.
  const gap = clamp((opponentReputation - club.Reputation) / 30, -1, 1);

  // Fans: a share of the fanbase, capped at +/-8% per match.
  const fansPct = clamp(
    { W: 0.025, D: 0.004, L: -0.02 }[result] +
      (result === 'W' ? 0.01 * gap : result === 'L' ? 0.01 * gap : 0) +
      streakBonus(form, 0.01, 0.03),
    -0.08,
    0.08
  );
  const fansAfter = Math.max(Math.round(club.Fans * (1 + fansPct)) + (result === 'W' ? 10 : 0), FANS_FLOOR);

  // Reputation moves slowly and tracks who you beat: an upset moves it
  // twice as far, beating a much smaller club doesn't move it at all. So it
  // settles near the reputation of the clubs you can actually beat.
  const repDelta =
    result === 'W'
      ? gap > 0.3 ? 2 : gap < -0.3 ? 0 : 1
      : result === 'L'
        ? gap < -0.3 ? -2 : gap > 0.3 ? 0 : -1
        : gap > 0.3 ? 1 : gap < -0.3 ? -1 : 0;
  const repAfter = clamp(club.Reputation + repDelta, 1, 100);

  const boardDelta = { W: 3, D: 0, L: -3 }[result] + streakBonus(form, 1, 3);
  const boardAfter = clamp(club.BoardConfidence + boardDelta, 5, 95);

  // Morale: a push from the result, then a quarter of the way back towards
  // neutral, so even a long run settles around 36-84 instead of pinning.
  const moraleDelta = { W: 4, D: 0, L: -4 }[result] + streakBonus(form, 1, 2);
  await db()
    .update(players)
    .set({
      MoraleValue: sql`least(${MORALE_MAX}, greatest(${MORALE_MIN}, round(${players.MoraleValue} + ${moraleDelta} + (${MORALE_NEUTRAL} - ${players.MoraleValue}) * 0.25)))::int`,
    })
    .where(and(eq(players.ClubId, clubId), eq(players.isRetired, false)));

  await db()
    .update(clubs)
    .set({
      Form: form,
      Fans: fansAfter,
      Reputation: repAfter,
      BoardConfidence: boardAfter,
      updatedAt: new Date(),
    })
    .where(eq(clubs.id, clubId));

  // Only human-owned clubs get an inbox - AI clubs just move.
  if (club.UserId) {
    const messages = messagesFor(
      club.Name,
      form,
      club.BoardConfidence,
      boardAfter,
      fansAfter - club.Fans
    );
    if (messages.length) {
      await db()
        .insert(clubMessages)
        .values(
          messages.map((m) => ({
            ClubId: clubId,
            Kind: m.kind,
            Tone: m.tone,
            Title: m.title,
            Body: m.body,
            updatedAt: new Date(),
          }))
        );
    }
  }

  return {
    fans: { before: club.Fans, after: fansAfter },
    reputation: { before: club.Reputation, after: repAfter },
    boardConfidence: { before: club.BoardConfidence, after: boardAfter },
    moraleDelta,
    form,
  };
}

/** Both sides of a finished match, from updateFixture. */
export async function applyMatchResult(
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number
) {
  const [home, away] = await Promise.all([ensureStanding(homeId), ensureStanding(awayId)]);
  await applyMatchOutcome(homeId, {
    goalsFor: homeGoals,
    goalsAgainst: awayGoals,
    opponentReputation: away.Reputation,
  });
  await applyMatchOutcome(awayId, {
    goalsFor: awayGoals,
    goalsAgainst: homeGoals,
    opponentReputation: home.Reputation,
  });
}

/**
 * Share of a stadium that turns up: fanbase relative to capacity, recent
 * form and the opponent's pull, plus a little noise. Replaces the old flat
 * random 65-95% band that ignored results entirely.
 */
export function attendanceFill(params: {
  fans: number;
  capacity: number;
  form: ClubForm | null | undefined;
  opponentReputation: number;
}): number {
  const { fans, capacity, form, opponentReputation } = params;
  const pull = Math.min(fans / Math.max(capacity, 1), 1.2);
  const base = Math.min(0.3 + 0.55 * pull, 1);
  const formMod = formScore(form) * 0.12;
  const draw = clamp((opponentReputation - 50) / 50, -1, 1) * 0.05;
  const noise = (Math.random() - 0.5) * 0.08;
  return clamp(base + formMod + draw + noise, 0.2, 1);
}

/**
 * Small Rating nudge for a club's next match from squad morale and form,
 * clamped to +/-1.75 (about +/-10% expected goals in QuickSim). Read by
 * jobs/buildSimulateMatchRequest.ts.
 */
export async function moodRatingBonus(clubIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!clubIds.length) return out;
  const [clubRows, moraleRows] = await Promise.all([
    db().select({ id: clubs.id, Form: clubs.Form }).from(clubs).where(inArray(clubs.id, clubIds)),
    db()
      .select({ clubId: players.ClubId, morale: avg(players.MoraleValue) })
      .from(players)
      .where(and(inArray(players.ClubId, clubIds), eq(players.isRetired, false)))
      .groupBy(players.ClubId),
  ]);
  const moraleOf = new Map(moraleRows.map((r) => [r.clubId, Number(r.morale ?? MORALE_NEUTRAL)]));
  for (const c of clubRows) {
    const morale = moraleOf.get(c.id) ?? MORALE_NEUTRAL;
    const bonus = ((morale - MORALE_NEUTRAL) / 35) * 1.25 + formScore(c.Form) * 0.5;
    out.set(c.id, clamp(bonus, -1.75, 1.75));
  }
  return out;
}

/** Fan mood as a 0-100 figure for the UI: form plus fanbase momentum. */
export function fanApproval(form: ClubForm | null | undefined, boardConfidence: number): number {
  return clamp(Math.round(55 + formScore(form) * 30 + (boardConfidence - 60) * 0.3), 5, 99);
}

export interface StandingView {
  fans: number;
  reputation: number;
  boardConfidence: number;
  fanApproval: number;
  squadMorale: number;
  form: Result[];
  streak: { type: Result; length: number } | null;
}

/** The club's standing for the play screen. */
export async function getStanding(clubId: string): Promise<StandingView> {
  const club = await ensureStanding(clubId);
  const [row] = await db()
    .select({ morale: avg(players.MoraleValue) })
    .from(players)
    .where(and(eq(players.ClubId, clubId), eq(players.isRetired, false)));
  return {
    fans: club.Fans,
    reputation: club.Reputation,
    boardConfidence: club.BoardConfidence,
    fanApproval: fanApproval(club.Form, club.BoardConfidence),
    squadMorale: Math.round(Number(row?.morale ?? MORALE_NEUTRAL)),
    form: (club.Form?.recent ?? []).slice(0, 5),
    streak: club.Form?.streak ?? null,
  };
}

const INBOX_LIMIT = 30;

export async function getInbox(clubId: string) {
  const rows = await db()
    .select()
    .from(clubMessages)
    .where(eq(clubMessages.ClubId, clubId))
    .orderBy(desc(clubMessages.createdAt))
    .limit(INBOX_LIMIT);
  return {
    unread: rows.filter((r) => !r.Read).length,
    messages: rows.map((r) => ({
      id: r.id,
      kind: r.Kind,
      tone: r.Tone,
      title: r.Title,
      body: r.Body,
      read: r.Read,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function markInboxRead(clubId: string) {
  await db()
    .update(clubMessages)
    .set({ Read: true, updatedAt: new Date() })
    .where(and(eq(clubMessages.ClubId, clubId), eq(clubMessages.Read, false)));
  return getInbox(clubId);
}
