import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, managers, ownerProgram, transferLedger } from '../../db/drizzle/schema';
import {
  INTERVIEW_FEE,
  effectiveManagerFee,
  managerFee,
  managerOverall,
  managerWage,
  maskRange,
} from './manager-model';
import { getProgramState, type ProgramState } from './owner-program.service';
import type { ProgramManager } from '@repo/api-contract';

/**
 * The manager market (L4; OWNER-PROGRAM-SPEC §4 step 1, §8). Managers are real
 * hires: browse shows scouted ranges, an interview costs INTERVIEW_FEE and
 * reveals the exact attributes (and discounts the fee 10%), signing is one
 * transaction with a conditional budget debit, and a release returns the
 * manager to the pool. Every write shares the program state.
 */

const db = () => DrizzleDatabase.getInstance().database;
const MAX_POOL = 200;

type ManagerRow = typeof managers.$inferSelect;

function overallOf(m: ManagerRow): number {
  if (m.Overall != null) return m.Overall;
  return managerOverall({
    tactics: m.Tactics ?? 50,
    motivation: m.Motivation ?? 50,
    development: m.Development ?? 50,
    discipline: m.Discipline ?? 50,
  });
}

function feeOf(m: ManagerRow): number {
  return Math.round(m.SigningFee ?? managerFee(overallOf(m)));
}

function wageOf(m: ManagerRow): number {
  return Math.round(m.Wage ?? managerWage(overallOf(m)));
}

function toPublic(m: ManagerRow, interviewed: boolean): ProgramManager {
  const overall = overallOf(m);
  const signingFee = feeOf(m);
  return {
    id: m.id,
    firstName: m.FirstName,
    lastName: m.LastName,
    age: m.Age,
    nationalityId: m.NationalityId,
    preferredFormation: m.PreferredFormation,
    preferredStyle: m.PreferredStyle,
    overall: maskRange(overall),
    tactics: maskRange(m.Tactics ?? 50),
    motivation: maskRange(m.Motivation ?? 50),
    development: maskRange(m.Development ?? 50),
    discipline: maskRange(m.Discipline ?? 50),
    interviewed,
    signingFee,
    effectiveFee: effectiveManagerFee(signingFee, interviewed),
    wage: wageOf(m),
  };
}

/** Record the ids the owner has opened (distinct), so `tip.manager.scout`
 * fires after three. */
async function recordBrowsed(clubId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db().transaction(async (tx) => {
    const [program] = await tx.select().from(ownerProgram).where(eq(ownerProgram.ClubId, clubId)).for('update');
    if (!program) return;
    const scout = program.Scout ?? {};
    const seen = new Set(scout.managerIdsBrowsed ?? []);
    for (const id of ids) seen.add(id);
    await tx
      .update(ownerProgram)
      .set({ Scout: { ...scout, managerIdsBrowsed: [...seen].slice(-MAX_POOL) }, updatedAt: new Date() })
      .where(eq(ownerProgram.ClubId, clubId));
  });
}

/** Browse the free-manager pool, attributes masked. Records the browse. */
export async function browseManagers(clubId: string): Promise<{
  managers: ProgramManager[];
  budget: number;
  interviewFee: number;
}> {
  const [club] = await db().select({ budget: clubs.Budget }).from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');
  const rows = await db()
    .select()
    .from(managers)
    .where(and(eq(managers.isEmployed, false), isNull(managers.ClubId)))
    .orderBy(asc(managers.SigningFee), asc(managers.Key))
    .limit(MAX_POOL);
  const [program] = await db().select().from(ownerProgram).where(eq(ownerProgram.ClubId, clubId));
  const interviewed = new Set(program?.Scout?.interviewedManagerIds ?? []);
  if (rows.length) await recordBrowsed(clubId, rows.map((m) => m.id));
  return {
    managers: rows.map((m) => toPublic(m, interviewed.has(m.id))),
    budget: club.budget ?? 0,
    interviewFee: INTERVIEW_FEE,
  };
}

export interface ManagerReveal {
  id: string;
  overall: number;
  tactics: number;
  motivation: number;
  development: number;
  discipline: number;
  signingFee: number;
  wage: number;
}

/** Pay INTERVIEW_FEE to reveal the exact attributes (idempotent per manager). */
export async function interviewManager(clubId: string, managerId: string): Promise<ManagerReveal> {
  const reveal = await db().transaction(async (tx) => {
    const [program] = await tx.select().from(ownerProgram).where(eq(ownerProgram.ClubId, clubId)).for('update');
    if (!program) throw new Error('Program not started for this club');
    const [manager] = await tx.select().from(managers).where(eq(managers.id, managerId));
    if (!manager) throw new Error('Manager not found');
    if (manager.isEmployed || manager.ClubId) throw new Error('That manager is already employed');

    const scout = program.Scout ?? {};
    const already = (scout.interviewedManagerIds ?? []).includes(managerId);
    if (!already) {
      const debited = await tx
        .update(clubs)
        .set({ Budget: sql`coalesce(${clubs.Budget}, 0) - ${INTERVIEW_FEE}`, updatedAt: new Date() })
        .where(and(eq(clubs.id, clubId), sql`coalesce(${clubs.Budget}, 0) >= ${INTERVIEW_FEE}`))
        .returning({ id: clubs.id });
      if (!debited.length) throw new Error('Insufficient budget for an interview');
      await tx.insert(transferLedger).values({
        Type: 'manager_interview',
        BuyerClubId: clubId,
        Amount: INTERVIEW_FEE,
        Note: `Interview: ${manager.FirstName} ${manager.LastName}`,
        updatedAt: new Date(),
      });
      await tx
        .update(ownerProgram)
        .set({
          Scout: { ...scout, interviewedManagerIds: [...(scout.interviewedManagerIds ?? []), managerId] },
          updatedAt: new Date(),
        })
        .where(eq(ownerProgram.ClubId, clubId));
    }
    const overall = overallOf(manager);
    return {
      id: managerId,
      overall,
      tactics: manager.Tactics ?? 50,
      motivation: manager.Motivation ?? 50,
      development: manager.Development ?? 50,
      discipline: manager.Discipline ?? 50,
      signingFee: feeOf(manager),
      wage: wageOf(manager),
    } satisfies ManagerReveal;
  });
  return reveal;
}

/** Sign a manager: conditional budget debit + conditional hire, one tx. */
export async function signManager(
  clubId: string,
  managerId: string,
  contractYears = 3
): Promise<{ paid: number; state: ProgramState }> {
  const paid = await db().transaction(async (tx) => {
    const [club] = await tx
      .select({ managerId: clubs.ManagerId })
      .from(clubs)
      .where(eq(clubs.id, clubId))
      .for('update');
    if (!club) throw new Error('Club not found');
    if (club.managerId) throw new Error('This club already has a manager - release them first');

    const [manager] = await tx.select().from(managers).where(eq(managers.id, managerId)).for('update');
    if (!manager) throw new Error('Manager not found');
    const [program] = await tx.select().from(ownerProgram).where(eq(ownerProgram.ClubId, clubId));
    const interviewed = (program?.Scout?.interviewedManagerIds ?? []).includes(managerId);
    const fee = effectiveManagerFee(feeOf(manager), interviewed);

    const debited = await tx
      .update(clubs)
      .set({ Budget: sql`coalesce(${clubs.Budget}, 0) - ${fee}`, updatedAt: new Date() })
      .where(and(eq(clubs.id, clubId), sql`coalesce(${clubs.Budget}, 0) >= ${fee}`))
      .returning({ id: clubs.id });
    if (!debited.length) throw new Error('Insufficient budget to sign this manager');

    const hired = await tx
      .update(managers)
      .set({
        isEmployed: true,
        ClubId: clubId,
        ContractYears: contractYears,
        ContractUntilYear: sql`coalesce((SELECT "CurrentYear" FROM "Calendars" LIMIT 1), 1) + ${contractYears}`,
        updatedAt: new Date(),
      })
      .where(and(eq(managers.id, managerId), eq(managers.isEmployed, false), isNull(managers.ClubId)))
      .returning({ id: managers.id });
    if (!hired.length) throw new Error('Another club signed that manager first');

    await tx.update(clubs).set({ ManagerId: managerId, updatedAt: new Date() }).where(eq(clubs.id, clubId));
    await tx.insert(transferLedger).values({
      Type: 'manager_signing',
      BuyerClubId: clubId,
      Amount: fee,
      Note: `Signed ${manager.FirstName} ${manager.LastName}`,
      updatedAt: new Date(),
    });
    return fee;
  });

  const state = await getProgramState(clubId);
  return { paid, state };
}

/** Release the club's manager back into the pool. */
export async function releaseManager(clubId: string, managerId: string): Promise<ProgramState> {
  await db().transaction(async (tx) => {
    const released = await tx
      .update(clubs)
      .set({ ManagerId: null, updatedAt: new Date() })
      .where(and(eq(clubs.id, clubId), eq(clubs.ManagerId, managerId)))
      .returning({ id: clubs.id });
    if (!released.length) throw new Error('That is not your club manager');
    await tx
      .update(managers)
      .set({ isEmployed: false, ClubId: null, ContractYears: 0, ContractUntilYear: null, updatedAt: new Date() })
      .where(and(eq(managers.id, managerId), eq(managers.ClubId, clubId)));
  });
  return getProgramState(clubId);
}
