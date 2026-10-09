import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  clubs,
  ownerProgram,
  players,
  transferLedger,
} from '../../db/drizzle/schema';
import { calculateAndUpdateClubRating } from '../../controllers/clubs/club.service';
import { SCOUT_FEE, HIDDEN_SPREAD, maskRange } from './manager-model';
import { squadSummary } from './program-facts.service';
import { getProgramState, type ProgramState } from './owner-program.service';
import type { ProgramPlayer } from '@repo/api-contract';

/**
 * The free-agent side of the owner program (L5; OWNER-PROGRAM-SPEC §4 step 2,
 * §6.4): browse masked, scout a player for SCOUT_FEE, sign at Value with the
 * conditional budget + squad writes that make two racing owners safe. The seed
 * that fills this pool is 2C's world-seed job.
 */

const db = () => DrizzleDatabase.getInstance().database;
const MAX_POOL = 300;
const LEGAL_SQUAD = 11;

function toPublic(
  p: typeof players.$inferSelect,
  scouted: boolean
): ProgramPlayer {
  return {
    id: p.id,
    firstName: p.FirstName,
    lastName: p.LastName,
    age: p.Age,
    position: p.Position,
    nationalityId: p.NationalityId,
    // Rating is never exact to a Level-0 program club: a range until scouted.
    rating: maskRange(p.Rating ?? 0, HIDDEN_SPREAD, 0, 100),
    scouted,
    value: Math.round(p.Value ?? 0),
    wage: Math.round(p.Wage ?? 0),
  };
}

/** Browse the free-agent pool, ratings masked. */
export async function browsePlayers(clubId: string): Promise<{
  players: ProgramPlayer[];
  budget: number;
  scoutFee: number;
  needed: number;
}> {
  const [club] = await db()
    .select({ budget: clubs.Budget })
    .from(clubs)
    .where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');
  const rows = await db()
    .select()
    .from(players)
    .where(
      and(
        eq(players.isSigned, false),
        eq(players.isRetired, false),
        // A V0 player is a QA fixture, not a free agent (U-09 / P02-07).
        gt(players.Value, 0),
        isNull(players.ClubId)
      )
    )
    .orderBy(asc(players.Value), asc(players.id))
    .limit(MAX_POOL);
  const [program] = await db()
    .select()
    .from(ownerProgram)
    .where(eq(ownerProgram.ClubId, clubId));
  const scouted = new Set(program?.Scout?.scoutedPlayerIds ?? []);
  const squad = await squadSummary(clubId);
  return {
    players: rows.map((p) => toPublic(p, scouted.has(p.id))),
    budget: club.budget ?? 0,
    scoutFee: SCOUT_FEE,
    needed: Math.max(0, LEGAL_SQUAD - squad.total),
  };
}

export interface PlayerReveal {
  id: string;
  rating: number;
  attributes: Record<string, number>;
  value: number;
  wage: number;
}

/** Pay SCOUT_FEE to reveal a free agent's exact attributes (idempotent). */
export async function scoutPlayer(
  clubId: string,
  playerId: string
): Promise<PlayerReveal> {
  return db().transaction(async (tx) => {
    const [program] = await tx
      .select()
      .from(ownerProgram)
      .where(eq(ownerProgram.ClubId, clubId))
      .for('update');
    if (!program) throw new Error('Program not started for this club');
    const [player] = await tx
      .select()
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw new Error('Player not found');
    if (player.isSigned || player.ClubId)
      throw new Error('That player is not a free agent');

    const scout = program.Scout ?? {};
    const already = (scout.scoutedPlayerIds ?? []).includes(playerId);
    if (!already) {
      const debited = await tx
        .update(clubs)
        .set({
          Budget: sql`coalesce(${clubs.Budget}, 0) - ${SCOUT_FEE}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(clubs.id, clubId),
            sql`coalesce(${clubs.Budget}, 0) >= ${SCOUT_FEE}`
          )
        )
        .returning({ id: clubs.id });
      if (!debited.length) throw new Error('Insufficient budget to scout');
      await tx.insert(transferLedger).values({
        Type: 'player_scout',
        BuyerClubId: clubId,
        PlayerId: playerId,
        Amount: SCOUT_FEE,
        Note: `Scout: ${player.FirstName} ${player.LastName}`,
        updatedAt: new Date(),
      });
      await tx
        .update(ownerProgram)
        .set({
          Scout: {
            ...scout,
            scoutedPlayerIds: [...(scout.scoutedPlayerIds ?? []), playerId],
          },
          updatedAt: new Date(),
        })
        .where(eq(ownerProgram.ClubId, clubId));
    }
    const raw = (player.Attributes ?? {}) as Record<string, unknown>;
    const attributes: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw))
      if (typeof v === 'number') attributes[k] = v;
    return {
      id: playerId,
      rating: player.Rating ?? 0,
      attributes,
      value: Math.round(player.Value ?? 0),
      wage: Math.round(player.Wage ?? 0),
    } satisfies PlayerReveal;
  });
}

/**
 * Sign a free agent at Value. Two conditional writes in one transaction
 * (OWNER-PROGRAM-SPEC §6.4): the budget debit only succeeds while affordable,
 * the squad write only while the player is still unsigned - so two racing
 * owners cannot both win, and a retried call cannot double-sign.
 */
export async function signPlayer(
  clubId: string,
  playerId: string
): Promise<{ paid: number; state: ProgramState }> {
  const paid = await db().transaction(async (tx) => {
    const [club] = await tx
      .select({ code: clubs.ClubCode })
      .from(clubs)
      .where(eq(clubs.id, clubId));
    if (!club) throw new Error('Club not found');
    const [player] = await tx
      .select()
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw new Error('Player not found');
    const price = Math.round(player.Value ?? 0);

    const debited = await tx
      .update(clubs)
      .set({
        Budget: sql`coalesce(${clubs.Budget}, 0) - ${price}`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(clubs.id, clubId), sql`coalesce(${clubs.Budget}, 0) >= ${price}`)
      )
      .returning({ id: clubs.id });
    if (!debited.length)
      throw new Error('Insufficient budget to sign this player');

    const signed = await tx
      .update(players)
      .set({
        isSigned: true,
        ClubId: clubId,
        ClubCode: club.code,
        isTransferListed: false,
        AskingPrice: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(players.id, playerId),
          eq(players.isSigned, false),
          eq(players.isRetired, false),
          isNull(players.ClubId)
        )
      )
      .returning({ id: players.id });
    if (!signed.length)
      throw new Error('Another club signed that player first');

    await tx.insert(transferLedger).values({
      Type: 'transfer',
      PlayerId: playerId,
      BuyerClubId: clubId,
      Amount: price,
      Note: `Free agent: ${player.FirstName} ${player.LastName}`,
      updatedAt: new Date(),
    });
    return price;
  });

  await calculateAndUpdateClubRating(clubId);
  const state = await getProgramState(clubId);
  return { paid, state };
}
