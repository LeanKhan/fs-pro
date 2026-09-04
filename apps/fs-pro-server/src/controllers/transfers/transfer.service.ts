import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, players, transferLedger } from '../../db/drizzle/schema';
import { getPlayerById } from '../players/player.service';
import { getClubById, calculateAndUpdateClubRating } from '../clubs/club.service';
import type { PlayerInterface } from '../../interfaces/Player';
import type { ClubInterface } from '../clubs/club.model';

export interface PurchaseResult {
  player: PlayerInterface;
  buyingClub: ClubInterface;
  sellingClub: ClubInterface | null;
}

/**
 * Executes an instant, always-affordable-or-nothing player purchase - the
 * MVP transfer-market mechanic (no offer/negotiation/AI-accept step, see
 * FUTURE-PLANS.md's "Manager mode and owner mode" entry for the deferred
 * full version). Runs the money movement + player move + ledger write in
 * one real DB transaction (the first use of `db.transaction()` in this
 * codebase - justified because a partial write here, e.g. buyer debited
 * but the player never actually moves, is real, silent money loss, unlike
 * every other multi-step write elsewhere in this app).
 */
export async function executePurchase(
  playerId: string,
  buyingClubId: string,
  offerAmount: number
): Promise<PurchaseResult> {
  const [player, buyingClub] = await Promise.all([
    getPlayerById(playerId),
    getClubById(buyingClubId),
  ]);

  if (!player) throw new Error('Player not found');
  if (!buyingClub) throw new Error('Buying club not found');

  if (player.ClubId === buyingClubId) {
    throw new Error('This player already belongs to your club');
  }

  // getPlayerById (findById) deliberately doesn't filter retired players
  // out (their row stays viewable by id, matching this codebase's
  // never-hard-delete philosophy) - so this guard is the actual
  // enforcement point, not just belt-and-suspenders on top of the
  // free-agent browse list's default findAll() exclusion.
  if (player.isRetired) {
    throw new Error('This player has retired and can no longer be transferred');
  }

  const askingPrice = player.Value ?? 0;
  if (offerAmount < askingPrice) {
    throw new Error(
      `Offer must be at least the player's Value (${askingPrice})`
    );
  }

  const buyerBudget = buyingClub.Budget ?? 0;
  if (buyerBudget < offerAmount) {
    throw new Error('Insufficient Budget for this offer');
  }

  const sellingClubId = player.ClubId ?? null;
  const db = DrizzleDatabase.getInstance().database;

  await db.transaction(async (tx) => {
    await tx
      .update(clubs)
      .set({
        Budget: drizzleSql`coalesce(${clubs.Budget}, 0) - ${offerAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, buyingClubId));

    if (sellingClubId) {
      await tx
        .update(clubs)
        .set({
          Budget: drizzleSql`coalesce(${clubs.Budget}, 0) + ${offerAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(clubs.id, sellingClubId));
    }

    // Written as a raw `tx.update()`, not via player.service.ts's
    // `updatePlayerFields`/repository - the repository is bound to the
    // singleton `db`, not this transaction's `tx`, so calling it here would
    // run outside the transaction (autocommitted separately) instead of
    // atomically with the Budget writes above.
    await tx
      .update(players)
      .set({
        isSigned: true,
        ClubId: buyingClubId,
        ClubCode: buyingClub.ClubCode,
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId));

    await tx.insert(transferLedger).values({
      Type: 'transfer',
      PlayerId: playerId,
      BuyerClubId: buyingClubId,
      SellerClubId: sellingClubId,
      Amount: offerAmount,
      updatedAt: new Date(),
    });
  });

  // Rating recalculation happens after the transaction commits, same
  // pattern club.router.ts's addPlayerToClub/removePlayerFromClub already
  // use (a derived-state refresh, not part of the money-moving atomic step).
  const [refreshedPlayer, refreshedBuyingClub, refreshedSellingClub] =
    await Promise.all([
      getPlayerById(playerId),
      calculateAndUpdateClubRating(buyingClubId),
      sellingClubId ? calculateAndUpdateClubRating(sellingClubId) : null,
    ]);

  return {
    player: refreshedPlayer as PlayerInterface,
    buyingClub: refreshedBuyingClub as unknown as ClubInterface,
    sellingClub: refreshedSellingClub as unknown as ClubInterface | null,
  };
}

/**
 * Deducts every club's annual wage bill (sum of its signed roster's Wage)
 * from its Budget, once per game Year - called from calendar.router.ts's
 * `endSeasonCycle`, the same year-end hook Age/Rating/Value already use.
 * Guarded per-club against double-deduction via a TransferLedger existence
 * check (Type:'wage', BuyerClubId, Year) - `endSeasonCycle` itself isn't
 * generally idempotent (a pre-existing gap this doesn't attempt to fix),
 * but a silent double wage-charge is a real economic bug worth guarding
 * specifically, unlike a harmless double age-increment.
 */
export async function deductWagesForYear(year: string): Promise<void> {
  const db = DrizzleDatabase.getInstance().database;
  const allClubs = await db.select({ id: clubs.id }).from(clubs);

  for (const club of allClubs) {
    await db.transaction(async (tx) => {
      const alreadyDeducted = await tx.query.transferLedger.findFirst({
        where: and(
          eq(transferLedger.Type, 'wage'),
          eq(transferLedger.BuyerClubId, club.id),
          eq(transferLedger.Year, year)
        ),
      });
      if (alreadyDeducted) return;

      const [wageRow] = await tx
        .select({
          total: drizzleSql<number>`coalesce(sum(${players.Wage}), 0)`,
        })
        .from(players)
        .where(and(eq(players.ClubId, club.id), eq(players.isSigned, true)));

      const wageBill = Number(wageRow?.total ?? 0);

      await tx
        .update(clubs)
        .set({
          Budget: drizzleSql`coalesce(${clubs.Budget}, 0) - ${wageBill}`,
          updatedAt: new Date(),
        })
        .where(eq(clubs.id, club.id));

      await tx.insert(transferLedger).values({
        Type: 'wage',
        BuyerClubId: club.id,
        Amount: wageBill,
        Year: year,
        updatedAt: new Date(),
      });
    });
  }
}
