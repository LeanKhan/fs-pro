import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, players, transferLedger } from '../../db/drizzle/schema';
import { getPlayerById } from '../players/player.service';
import { getClubById, calculateAndUpdateClubRating } from '../clubs/club.service';
import type { PlayerInterface } from '../../interfaces/Player';
import type { ClubInterface } from '../clubs/club.model';
import { assertTransferWindowOpen } from '../../services/transfers/transfer-window.service';

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

  await assertTransferWindowOpen();

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

  // A player who belongs to a club is bought by bidding (transfer-market.service
  // placeBid) so the owner can accept, counter or refuse; only free agents
  // have nobody to negotiate with and are bought outright.
  if (player.ClubId) {
    throw new Error('This player is under contract - place a bid with his club instead');
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

  return settleTransfer({ playerId, buyingClubId, amount: offerAmount });
}

/**
 * Moves a player to `buyingClubId` and settles the money: buyer debited,
 * seller (if any) credited, ledger row written - all in one transaction -
 * then both clubs' ratings are refreshed. No affordability/window/ownership
 * checks: callers (executePurchase for free agents, the bid flow in
 * transfer-market.service.ts) validate first. `note` is stored on the ledger row.
 */
export async function settleTransfer(params: {
  playerId: string;
  buyingClubId: string;
  amount: number;
  note?: string;
}): Promise<PurchaseResult> {
  const { playerId, buyingClubId, amount: offerAmount, note } = params;
  const [player, buyingClub] = await Promise.all([
    getPlayerById(playerId),
    getClubById(buyingClubId),
  ]);
  if (!player) throw new Error('Player not found');
  if (!buyingClub) throw new Error('Buying club not found');

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
        // A sale ends any listing - he isn't for sale at his new club.
        isTransferListed: false,
        AskingPrice: null,
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId));

    await tx.insert(transferLedger).values({
      Type: 'transfer',
      PlayerId: playerId,
      BuyerClubId: buyingClubId,
      SellerClubId: sellingClubId,
      Amount: offerAmount,
      Note: note ?? null,
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
  // One statement for the whole world (docs/WORLD-PYRAMID-SPEC.md: the year
  // ends every 4 weeks, over 10k+ clubs): each club not yet charged for
  // `year` pays its signed players' wages and gets its ledger row. Released
  // clubs pay nothing. The advisory lock keeps two runs from both charging.
  await db.transaction(async (tx) => {
    await tx.execute(drizzleSql`select pg_advisory_xact_lock(hashtext(${`wages:${year}`}))`);
    await tx.execute(drizzleSql`
      WITH bills AS (
        SELECT c."_id" AS club, coalesce(sum(p."Wage") FILTER (WHERE p."isSigned"), 0) AS bill
        FROM "Clubs" c
        LEFT JOIN "Players" p ON p."ClubId" = c."_id"
        WHERE c."ReleasedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "TransferLedger" t
            WHERE t."Type" = 'wage' AND t."BuyerClubId" = c."_id" AND t."Year" = ${year}
          )
        GROUP BY c."_id"
      ),
      charged AS (
        UPDATE "Clubs" c
        SET "Budget" = coalesce(c."Budget", 0) - b.bill, "updatedAt" = now()
        FROM bills b
        WHERE c."_id" = b.club
        RETURNING c."_id"
      )
      INSERT INTO "TransferLedger" ("_id", "Type", "BuyerClubId", "Amount", "Year", "createdAt", "updatedAt")
      SELECT gen_random_uuid(), 'wage', b.club, b.bill, ${year}, now(), now() FROM bills b
    `);
  });
}
