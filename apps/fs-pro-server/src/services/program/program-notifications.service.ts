import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubMessages, clubs } from '../../db/drizzle/schema';
import { formatVilla } from '@repo/api-contract';
import type { ProgramEvaluation } from '@repo/api-contract';
import { postNews } from '../world/news-scope.service';

/**
 * The owner program's inbox and news hooks (L8; OWNER-PROGRAM-SPEC §4). When a
 * step completes, the world tells the owner about it: a short inbox card per
 * milestone, and — at the Level-1 moment — a local-news story that the club has
 * joined a league. Money in every line is Villa (L13/D2).
 *
 * These are best-effort side effects: a failure must never roll back the
 * program advance or the money ledger, so the caller catches and logs.
 */

const db = () => DrizzleDatabase.getInstance().database;

interface Milestone {
  kind: string;
  tone: 'good' | 'bad' | 'neutral';
  title: string;
  body: string;
}

/** The inbox card for one completed step, keyed by the step that finished. */
function milestoneFor(
  step: string,
  clubName: string,
  evaluation: ProgramEvaluation,
  nextBudget: number
): Milestone | null {
  const stars = evaluation.stars;
  const starWord = `${'★'.repeat(Math.max(1, stars))}`;
  switch (step) {
    case 'manager':
      return {
        kind: 'board',
        tone: 'good',
        title: `Your manager is in place`,
        body:
          `The dugout is filled and the brief is theirs to carry out (${starWord}). ` +
          `Now build them a legal XI — eleven bodies and a keeper. You hold ${formatVilla(nextBudget)}.`,
      };
    case 'players':
      return {
        kind: 'squad',
        tone: 'good',
        title: 'A legal matchday squad',
        body:
          `Eleven and a keeper are signed (${starWord}), so the gate is open: PLAY qualifying ` +
          `friendlies to earn the XP that carries you to Level 1.`,
      };
    case 'facilities':
      return {
        kind: 'board',
        tone: 'good',
        title: 'The foundations are in',
        body: `Your first Tier-1 build is complete (${starWord}). The club grows while you sleep.`,
      };
    case 'level1':
      return {
        kind: 'press',
        tone: 'good',
        title: 'Level 1 — you have a league',
        body: `${clubName} reached Level 1 (${starWord}). The game has found you a league place — open the League to meet your pool and your first fixture.`,
      };
    default:
      return null;
  }
}

/** Write the inbox card and (at Level 1) the news story for a completed step. */
export async function notifyProgramStep(
  clubId: string,
  step: string,
  evaluation: ProgramEvaluation
): Promise<void> {
  if (evaluation.stars <= 0) return;
  const [club] = await db()
    .select({ name: clubs.Name, budget: clubs.Budget })
    .from(clubs)
    .where(eq(clubs.id, clubId));
  if (!club) return;
  const milestone = milestoneFor(step, club.name, evaluation, club.budget ?? 0);
  if (!milestone) return;

  await db().insert(clubMessages).values({
    ClubId: clubId,
    Kind: milestone.kind,
    Tone: milestone.tone,
    Title: milestone.title,
    Body: milestone.body,
    updatedAt: new Date(),
  });

  if (step === 'level1') {
    await postNews({
      kind: 'level_up',
      importance: 22,
      title: `${club.name} reach Level 1`,
      body: `${club.name} earned their place in the pyramid and have been drawn into a league.`,
      clubIds: [clubId],
    });
  }
}
