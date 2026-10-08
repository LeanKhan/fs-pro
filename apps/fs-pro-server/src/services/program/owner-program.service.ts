import { and, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, ownerProgram, transferLedger } from '../../db/drizzle/schema';
import { formatVilla } from '@repo/api-contract';
import type { AdvisorLine, ProgramAdvisorState, ProgramEvaluation, ProgramStep } from '@repo/api-contract';
import { evaluateProgramStep, programTip } from '../world/world-service.client';
import { addXp, enterPyramidAtLevelOne } from '../world/level-change';
import { buildStepFacts, type PersistedStep, type ProgramEventOverrides } from './program-facts.service';
import { notifyProgramStep } from './program-notifications.service';
import { ACTIVE_STEPS, NEXT_STEP, activeStepOf, programXpFromStars } from './program-constants';

/**
 * The owner-program state machine (L8): the server-side step, stars and XP, and
 * the calls to the pure Go engine that evaluates them
 * (PROGRAM-SERVICE-CONTRACT.md §3-§4). Node owns the state and every write; Go
 * only scores.
 */

const db = () => DrizzleDatabase.getInstance().database;

export interface ProgramState {
  clubId: string;
  step: PersistedStep;
  stepStars: Record<string, number>;
  programXp: number;
  startingBalance: number;
  budget: number;
  completed: boolean;
  stars: number;
  xp: number;
  reasons: string[];
  advisor: AdvisorLine | null;
  chapter: string | null;
}

type ProgramRow = typeof ownerProgram.$inferSelect;

export { activeStepOf };

/** Read the club's program row, creating one when a path other than founding
 * made the club (defensive; every real club has a row). */
export async function ensureProgram(clubId: string): Promise<ProgramRow> {
  const [existing] = await db().select().from(ownerProgram).where(eq(ownerProgram.ClubId, clubId));
  if (existing) return existing;
  const [club] = await db().select({ budget: clubs.Budget, xp: clubs.XP }).from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');
  const [row] = await db()
    .insert(ownerProgram)
    .values({
      ClubId: clubId,
      Step: 'manager',
      StartingBalance: club.budget ?? 0,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [again] = await db().select().from(ownerProgram).where(eq(ownerProgram.ClubId, clubId));
  return again!;
}

/** Evaluate the persisted active step against the Go engine. */
async function evaluateCurrent(
  clubId: string,
  step: PersistedStep
): Promise<{ step: ProgramStep; evaluation: ProgramEvaluation } | null> {
  const active = activeStepOf(step);
  if (!active) return null;
  const facts = await buildStepFacts(clubId, active);
  const evaluation = await evaluateProgramStep({ step: active, facts });
  return { step: active, evaluation };
}

/**
 * Record one completed step and advance: store the stars, recompute the capped
 * program XP, move to the next active step, and credit the reward XP to
 * Clubs.XP through the level-change seam (L6). The conditional `Step` update
 * makes two concurrent advances credit XP exactly once.
 */
async function recordAndAdvance(
  clubId: string,
  step: ProgramStep,
  evaluation: ProgramEvaluation
): Promise<boolean> {
  const advanced = await db().transaction(async (tx) => {
    const [program] = await tx
      .select()
      .from(ownerProgram)
      .where(eq(ownerProgram.ClubId, clubId))
      .for('update');
    if (!program || program.Step !== step) return false;
    const stepStars = { ...program.StepStars, [step]: evaluation.stars };
    const programXp = programXpFromStars(stepStars);
    const next = NEXT_STEP[step]! as PersistedStep;
    const moved = await tx
      .update(ownerProgram)
      .set({
        Step: next,
        StepStars: stepStars,
        ProgramXp: programXp,
        CompletedAt: next === 'done' ? (program.CompletedAt ?? new Date()) : program.CompletedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(ownerProgram.ClubId, clubId), eq(ownerProgram.Step, step)))
      .returning({ clubId: ownerProgram.ClubId });
    if (!moved.length) return false;
    if (evaluation.xp > 0) {
      const [cal] = await tx
        .select({ day: calendars.CurrentDay, thresholds: calendars.LevelThresholds })
        .from(calendars)
        .limit(1);
      await addXp(tx, clubId, evaluation.xp, cal?.day ?? 0, null, cal?.thresholds ?? null);
    }
    return true;
  });
  return advanced;
}

/** Re-evaluate the current step and advance it when complete. Returns the
 * (possibly advanced) program state. */
export async function refreshProgram(clubId: string): Promise<ProgramState> {
  let program = await ensureProgram(clubId);
  if (program.Step === 'not_started') {
    await db()
      .update(ownerProgram)
      .set({ Step: 'manager', updatedAt: new Date() })
      .where(and(eq(ownerProgram.ClubId, clubId), eq(ownerProgram.Step, 'not_started')));
    program = await ensureProgram(clubId);
  }
  const current = await evaluateCurrent(clubId, program.Step as PersistedStep);
  if (current?.evaluation.completed) {
    const advanced = await recordAndAdvance(clubId, current.step, current.evaluation);
    if (advanced) {
      // The reward XP may have crossed Level 1 (L2): run the pyramid trigger.
      await enterPyramidAtLevelOne(clubId).catch((err: unknown) =>
        console.warn('[program] pyramid trigger', err)
      );
      // Inbox/news hooks (L8): best-effort, never fail the advance.
      await notifyProgramStep(clubId, current.step, current.evaluation).catch((err: unknown) =>
        console.warn('[program] milestone notification', err)
      );
      return stateWithoutEvaluation(clubId, current.evaluation, true);
    }
  }
  return stateWithEvaluation(clubId, current);
}

/** `GET /program/:clubId`: refresh, but degrade cleanly when the Go engine is
 * unreachable instead of failing the whole read. */
export async function getProgramState(clubId: string): Promise<ProgramState> {
  try {
    return await refreshProgram(clubId);
  } catch (err) {
    console.warn('[program] evaluate unavailable', err);
    const program = await ensureProgram(clubId);
    const persisted = program.Step === 'not_started' ? 'manager' : (program.Step as PersistedStep);
    return {
      clubId,
      step: persisted,
      stepStars: program.StepStars,
      programXp: program.ProgramXp,
      startingBalance: program.StartingBalance,
      budget: await budgetOf(clubId),
      completed: false,
      stars: 0,
      xp: 0,
      reasons: ['program engine unavailable'],
      advisor: null,
      chapter: program.Chapter,
    };
  }
}

async function budgetOf(clubId: string): Promise<number> {
  const [club] = await db().select({ budget: clubs.Budget }).from(clubs).where(eq(clubs.id, clubId));
  return club?.budget ?? 0;
}

async function stateWithEvaluation(
  clubId: string,
  current: { step: ProgramStep; evaluation: ProgramEvaluation } | null
): Promise<ProgramState> {
  const program = await ensureProgram(clubId);
  return {
    clubId,
    step: program.Step as PersistedStep,
    stepStars: program.StepStars,
    programXp: program.ProgramXp,
    startingBalance: program.StartingBalance,
    budget: await budgetOf(clubId),
    completed: current?.evaluation.completed ?? program.Step === 'done',
    stars: current?.evaluation.stars ?? 0,
    xp: current?.evaluation.xp ?? 0,
    reasons: current?.evaluation.reasons ?? [],
    advisor: current?.evaluation.advisor[0] ?? null,
    chapter: program.Chapter,
  };
}

async function stateWithoutEvaluation(
  clubId: string,
  evaluation: ProgramEvaluation,
  completed: boolean
): Promise<ProgramState> {
  const program = await ensureProgram(clubId);
  return {
    clubId,
    step: program.Step as PersistedStep,
    stepStars: program.StepStars,
    programXp: program.ProgramXp,
    startingBalance: program.StartingBalance,
    budget: await budgetOf(clubId),
    completed,
    stars: evaluation.stars,
    xp: evaluation.xp,
    reasons: evaluation.reasons,
    advisor: evaluation.advisor[0] ?? null,
    chapter: program.Chapter,
  };
}

/** `POST /program/:clubId/advance`: strict - a Go failure is surfaced. */
export async function advanceProgram(clubId: string): Promise<ProgramState> {
  return refreshProgram(clubId);
}

/**
 * The highest-priority contextual advisor tip (L9; PROGRAM-SERVICE-CONTRACT §6).
 * Node re-derives the club's `StepFacts` from the DB and forwards the owner's
 * advisor memory to the pure Go `POST /program/tip` engine. Tips are silent once
 * the program is over (`done`), and the server-side dismissal list is merged in
 * so a tip dismissed on one device never returns on another (L8).
 */
export async function getTip(
  clubId: string,
  advisor: ProgramAdvisorState,
  now: number,
  events?: ProgramEventOverrides
): Promise<AdvisorLine | null> {
  const program = await ensureProgram(clubId);
  const active = activeStepOf(program.Step);
  if (!active) return null;
  const facts = await buildStepFacts(clubId, active, events);
  const dismissed = [...new Set([...(program.DismissedTips ?? []), ...(advisor.dismissed ?? [])])];
  const response = await programTip({
    facts,
    advisor: {
      shows: advisor.shows ?? {},
      lastShownAt: advisor.lastShownAt ?? {},
      dismissed,
      quiet: advisor.quiet ?? false,
    },
    now,
  });
  return response.tip ?? null;
}

/** Server-side tip dismissal (L9). */
export async function dismissTip(clubId: string, tipId: string): Promise<string[]> {
  const program = await ensureProgram(clubId);
  const dismissed = program.DismissedTips ?? [];
  if (!dismissed.includes(tipId)) dismissed.push(tipId);
  await db()
    .update(ownerProgram)
    .set({ DismissedTips: dismissed, updatedAt: new Date() })
    .where(eq(ownerProgram.ClubId, clubId));
  return dismissed;
}

/**
 * The L7 recovery path: a board advance of `LOAN_GROSS` less a `LOAN_FEE`
 * (contract §8.1). Available to a club that has run out of cash, but only once
 * per game year (a per-club ledger guard), so it recovers a bad run instead of
 * being an infinite money tap. 2C owns this tuning.
 */
export const LOAN_GROSS = 250_000;
export const LOAN_FEE = 50_000;

export async function requestLoan(clubId: string): Promise<{ granted: boolean; amount: number }> {
  const amount = LOAN_GROSS - LOAN_FEE;
  const [calendar] = await db()
    .select({ year: calendars.CurrentYear })
    .from(calendars)
    .limit(1);
  const year = `Y${calendar?.year ?? 0}`;
  await db().transaction(async (tx) => {
    const [already] = await tx
      .select({ id: transferLedger.id })
      .from(transferLedger)
      .where(
        and(
          eq(transferLedger.Type, 'board_advance'),
          eq(transferLedger.BuyerClubId, clubId),
          eq(transferLedger.Year, year)
        )
      )
      .limit(1);
    if (already) throw new Error('The board has already advanced you funds this year');
    await tx
      .update(clubs)
      .set({ Budget: sql`coalesce(${clubs.Budget}, 0) + ${amount}`, updatedAt: new Date() })
      .where(eq(clubs.id, clubId));
    await tx.insert(transferLedger).values({
      Type: 'board_advance',
      BuyerClubId: clubId,
      Amount: amount,
      Year: year,
      Note: `Board advance: ${formatVilla(LOAN_GROSS)} granted, ${formatVilla(LOAN_FEE)} fee`,
      updatedAt: new Date(),
    });
  });
  return { granted: true, amount };
}

/** Post-Level-1 chapter state (L8). Minimal: the stored chapter plus a target.
 * The full chapter predicates are a 2C/3C follow-up. */
export async function getChapterState(clubId: string): Promise<{
  chapter: string | null;
  data: Record<string, unknown> | null;
  target: string | null;
  complete: boolean;
}> {
  const program = await ensureProgram(clubId);
  if (program.Step !== 'done') {
    return { chapter: null, data: null, target: null, complete: false };
  }
  const chapter = program.Chapter ?? 'first_season';
  if (!program.Chapter) {
    await db()
      .update(ownerProgram)
      .set({ Chapter: chapter, updatedAt: new Date() })
      .where(eq(ownerProgram.ClubId, clubId));
  }
  const target = 'Finish in the top half of your pool';
  return {
    chapter,
    data: (program.ChapterData as Record<string, unknown> | null) ?? null,
    target,
    complete: false,
  };
}

/** The four active steps, re-exported for tests and callers. */
export { ACTIVE_STEPS };
