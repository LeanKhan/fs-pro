import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs } from '../../db/drizzle/schema';
import { squadSummary } from './program-facts.service';

/**
 * The PLAY gate (L5 / OWNER-PROGRAM-SPEC §6.4): a club cannot play until it
 * has a manager and a legal matchday squad. The exact minimum is the same one
 * the engine's default XI needs: 11 signed, non-retired players, at least one
 * of them a goalkeeper. Existing clubs are unaffected (they keep their
 * managers and squads, L3).
 */

const db = () => DrizzleDatabase.getInstance().database;

export const MIN_SQUAD_SIZE = 11;
export const MIN_GOALKEEPERS = 1;

export type GateCode = 'club_not_found' | 'no_manager' | 'no_keeper' | 'no_squad';

/** A typed, client-consumable refusal (the advisor turns `code` into a tip). */
export class ProgramGateError extends Error {
  readonly status = 409;
  constructor(
    readonly code: GateCode,
    message: string
  ) {
    super(message);
    this.name = 'ProgramGateError';
  }
}

/**
 * The pure gate decision, so the rule is table-testable without a DB. Returns
 * the refusal, or null when the club may play. Checked in the order the advisor
 * should surface: manager first, then the keeper, then the headcount.
 */
export function gateProblem(
  managerId: string | null | undefined,
  squad: { total: number; gk: number }
): ProgramGateError | null {
  if (!managerId) {
    return new ProgramGateError(
      'no_manager',
      'Sign a manager before your first match - the owner sets the brief, the manager runs it'
    );
  }
  if (squad.gk < MIN_GOALKEEPERS) {
    return new ProgramGateError('no_keeper', 'No keeper, no match. Sign a goalkeeper to open the gate');
  }
  if (squad.total < MIN_SQUAD_SIZE) {
    return new ProgramGateError(
      'no_squad',
      `A matchday squad needs at least ${MIN_SQUAD_SIZE} players - you have ${squad.total}`
    );
  }
  return null;
}

/**
 * Throw a `ProgramGateError` unless `clubId` may play. Cheap enough to call at
 * the top of every PLAY; the squad read is one indexed query.
 */
export async function assertClubPlayable(clubId: string): Promise<void> {
  const [club] = await db()
    .select({ managerId: clubs.ManagerId })
    .from(clubs)
    .where(eq(clubs.id, clubId));
  if (!club) throw new ProgramGateError('club_not_found', 'Club not found');
  const squad = await squadSummary(clubId);
  const problem = gateProblem(club.managerId, squad);
  if (problem) throw problem;
}
