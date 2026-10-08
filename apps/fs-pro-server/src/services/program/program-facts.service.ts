import { and, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubAssets, clubs, managers, ownerProgram, players } from '../../db/drizzle/schema';
import type { ProgramStepFacts } from '@repo/api-contract';
import { programXpFromStars } from './program-constants';
import { managerFee, managerWage, managerOverall } from './manager-model';

/**
 * Build the pure `StepFacts` snapshot from the database (PROGRAM-SERVICE-
 * CONTRACT.md §1.2) immediately before calling the Go program engine. This is
 * the read side: no writes, no money. The manager/player market and the owner
 * program service are the only writers.
 */

const db = () => DrizzleDatabase.getInstance().database;

export type PersistedStep = 'not_started' | 'manager' | 'players' | 'facilities' | 'level1' | 'done';

export interface SquadSummary {
  total: number;
  gk: number;
  def: number;
  mid: number;
  att: number;
  medianRating: number;
}

const POSITION_BUCKET: Record<string, keyof Pick<SquadSummary, 'gk' | 'def' | 'mid' | 'att'>> = {
  GK: 'gk',
  DEF: 'def',
  MID: 'mid',
  ATT: 'att',
};

/** The club's signed, non-retired players as the facts builder counts them. */
export async function squadSummary(clubId: string): Promise<SquadSummary> {
  const rows = await db()
    .select({ position: players.Position, rating: players.Rating })
    .from(players)
    .where(and(eq(players.ClubId, clubId), eq(players.isSigned, true), eq(players.isRetired, false)));

  const summary: SquadSummary = { total: 0, gk: 0, def: 0, mid: 0, att: 0, medianRating: 0 };
  for (const p of rows) {
    summary.total++;
    const bucket = p.position ? POSITION_BUCKET[p.position] : undefined;
    if (bucket) summary[bucket]++;
  }
  // Median of the best XI by Rating (contract §1.2).
  const ratings = rows
    .map((p) => p.rating ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 11);
  if (ratings.length) {
    const mid = Math.floor(ratings.length / 2);
    summary.medianRating =
      ratings.length % 2 ? ratings[mid]! : (ratings[mid - 1]! + ratings[mid]!) / 2;
  }
  return summary;
}

interface ManagerFacts {
  overall: number;
  tactics: number;
  motivation: number;
  development: number;
  discipline: number;
  signingFee: number;
  wage: number;
  contractYears: number;
}

async function managerFacts(clubId: string): Promise<ManagerFacts | null> {
  const [m] = await db()
    .select()
    .from(managers)
    .where(and(eq(managers.ClubId, clubId), eq(managers.isEmployed, true)))
    .limit(1);
  if (!m) return null;
  const tactics = m.Tactics ?? 50;
  const motivation = m.Motivation ?? 50;
  const development = m.Development ?? 50;
  const discipline = m.Discipline ?? 50;
  const overall = m.Overall ?? managerOverall({ tactics, motivation, development, discipline });
  return {
    overall,
    tactics,
    motivation,
    development,
    discipline,
    signingFee: m.SigningFee ?? managerFee(overall),
    wage: m.Wage ?? managerWage(overall),
    contractYears: m.ContractYears ?? 0,
  };
}

async function friendlyRecord(clubId: string): Promise<{ wins: number; draws: number; losses: number }> {
  const rows = await db().execute(sql`
    SELECT
      count(*) FILTER (WHERE
        (f."HomeTeamId" = ${clubId} AND (f."Details"->>'HomeTeamScore')::int > (f."Details"->>'AwayTeamScore')::int)
        OR (f."AwayTeamId" = ${clubId} AND (f."Details"->>'AwayTeamScore')::int > (f."Details"->>'HomeTeamScore')::int)
      )::int AS wins,
      count(*) FILTER (WHERE
        (f."Details"->>'HomeTeamScore')::int = (f."Details"->>'AwayTeamScore')::int
      )::int AS draws,
      count(*) FILTER (WHERE
        (f."HomeTeamId" = ${clubId} AND (f."Details"->>'HomeTeamScore')::int < (f."Details"->>'AwayTeamScore')::int)
        OR (f."AwayTeamId" = ${clubId} AND (f."Details"->>'AwayTeamScore')::int < (f."Details"->>'HomeTeamScore')::int)
      )::int AS losses
    FROM "Fixtures" f
    WHERE f."Type" = 'friendly' AND f."Played" = true
      AND (f."HomeTeamId" = ${clubId} OR f."AwayTeamId" = ${clubId})
  `);
  const row = (rows as unknown as { wins: number; draws: number; losses: number }[])[0];
  return { wins: Number(row?.wins ?? 0), draws: Number(row?.draws ?? 0), losses: Number(row?.losses ?? 0) };
}

/** Build `StepFacts` for a club at a given active step. */
export async function buildStepFacts(
  clubId: string,
  step: ProgramStepFacts['step']
): Promise<ProgramStepFacts> {
  const [club] = await db().select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');
  const [program] = await db().select().from(ownerProgram).where(eq(ownerProgram.ClubId, clubId));

  const [manager, squad, assets, friendlies] = await Promise.all([
    managerFacts(clubId),
    squadSummary(clubId),
    db()
      .select({ type: clubAssets.AssetType, tier: clubAssets.Level, upgradingTo: clubAssets.UpgradingTo })
      .from(clubAssets)
      .where(eq(clubAssets.ClubId, clubId)),
    friendlyRecord(clubId),
  ]);

  const scout = program?.Scout ?? {};
  return {
    step,
    startingBalance: program?.StartingBalance ?? club.Budget ?? 0,
    budget: club.Budget ?? 0,
    manager,
    squad,
    assets: assets.map((a) => ({
      type: a.type,
      tier: a.tier,
      upgradingTo: a.upgradingTo ?? null,
      hasEffect: a.tier >= 1,
    })),
    programXp: programXpFromStars(program?.StepStars ?? {}, step),
    clubXp: club.XP,
    friendlies,
    scout: {
      managersBrowsed: (scout.managerIdsBrowsed ?? []).length,
      interviewedManagerIds: scout.interviewedManagerIds ?? [],
      scoutedPlayerIds: scout.scoutedPlayerIds ?? [],
    },
    events: {
      playBlocked: false,
      sessionMinutes: 0,
      programCompletedOnce: program?.Step === 'done' && !!program?.CompletedAt,
    },
  };
}
