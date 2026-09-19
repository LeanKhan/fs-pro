import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, players, transferOffers } from '../../db/drizzle/schema';
import { settleTransfer } from '../../controllers/transfers/transfer.service';
import { getTransferWindow, assertTransferWindowOpen } from './transfer-window.service';

/** Placeholder tuning values - everything that shapes the market lives here.
 * Squads in this world run ~12-19 players (11 starters + a thin bench), so a club
 * will not sell below MIN_SQUAD_SIZE and will not buy above MAX_SQUAD_SIZE. */
const MIN_SQUAD_SIZE = 12;
const MAX_SQUAD_SIZE = 20;
/** Refuse bids below this share of a player's Value outright. */
const MIN_BID_SHARE_OF_VALUE = 0.5;
const MAX_OPEN_BIDS_PER_CLUB = 5;
/** Game days an unanswered offer stays open. */
const OFFER_LIFETIME_DAYS = 4;
const MAX_PENDING_OFFERS_PER_HUMAN_CLUB = 2;
/** Daily chance an AI club makes a bid for one of a human club's players. */
const AI_BID_CHANCE_PER_DAY = 0.4;
const AI_DEALS_PER_DAY = 3;
const AI_DEAL_CHANCE = 0.6;

const OPEN_STATUSES = ['pending', 'countered'];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]): T | undefined =>
  items.length ? items[Math.floor(Math.random() * items.length)] : undefined;

interface RosterPlayer {
  id: string;
  ClubId: string | null;
  Position: string | null;
  Rating: number;
  Value: number;
  name: string;
}

interface ClubRow {
  id: string;
  Name: string;
  ClubCode: string;
  Budget: number;
  UserId: string | null;
}

const db = () => DrizzleDatabase.getInstance().database;

async function loadClubs(): Promise<ClubRow[]> {
  const rows = await db()
    .select({
      id: clubs.id,
      Name: clubs.Name,
      ClubCode: clubs.ClubCode,
      Budget: clubs.Budget,
      UserId: clubs.UserId,
    })
    .from(clubs);
  return rows.map((c) => ({ ...c, Budget: c.Budget ?? 0 }));
}

/** Every active (non-retired) player: signed ones grouped by club, plus free agents. */
async function loadPlayers() {
  const rows = await db()
    .select({
      id: players.id,
      ClubId: players.ClubId,
      isSigned: players.isSigned,
      Position: players.Position,
      Rating: players.Rating,
      Value: players.Value,
      FirstName: players.FirstName,
      LastName: players.LastName,
    })
    .from(players)
    .where(eq(players.isRetired, false));

  const byClub = new Map<string, RosterPlayer[]>();
  const freeAgents: RosterPlayer[] = [];
  for (const r of rows) {
    const player: RosterPlayer = {
      id: r.id,
      ClubId: r.ClubId,
      Position: r.Position,
      Rating: r.Rating ?? 0,
      Value: r.Value ?? 0,
      name: `${r.FirstName} ${r.LastName}`,
    };
    if (r.isSigned && r.ClubId) {
      byClub.set(r.ClubId, [...(byClub.get(r.ClubId) ?? []), player]);
    } else if (!r.isSigned) {
      freeAgents.push(player);
    }
  }
  return { byClub, freeAgents };
}

/** Would this player upgrade the club? Better than the median rating the
 * club already has in his position, or the club is short there. */
function improvesSquad(player: RosterPlayer, roster: RosterPlayer[]): boolean {
  const samePosition = roster
    .filter((p) => p.Position === player.Position)
    .map((p) => p.Rating)
    .sort((a, b) => a - b);
  if (samePosition.length < 2) return true;
  return player.Rating > samePosition[Math.floor(samePosition.length / 2)];
}

/** Rating rank within his own club (1 = best). */
function rankInRoster(player: RosterPlayer, roster: RosterPlayer[]): number {
  return roster.filter((p) => p.Rating > player.Rating).length + 1;
}

/** How an AI club answers a bid: accept, counter at its asking price, or refuse. */
export function aiResponse(params: {
  amount: number;
  value: number;
  isKeyPlayer: boolean;
  sellerSquadSize: number;
}): { decision: 'accepted' | 'countered' | 'rejected'; ask: number; reason?: string } {
  const { amount, value, isKeyPlayer, sellerSquadSize } = params;
  const multiplier = 1.05 + (isKeyPlayer ? 0.25 : 0) + rand(-0.05, 0.1);
  const ask = Math.round(value * multiplier);

  if (sellerSquadSize <= MIN_SQUAD_SIZE) {
    return { decision: 'rejected', ask, reason: 'They cannot sell - their squad is too thin' };
  }
  if (amount >= ask) return { decision: 'accepted', ask };
  if (amount >= ask * 0.75) return { decision: 'countered', ask };
  return { decision: 'rejected', ask, reason: 'Offer far below their valuation' };
}

async function currentDay(): Promise<number> {
  return (await getTransferWindow()).currentDay;
}

/** Marks an offer finished, keeping a short reason for the UI. */
async function finishOffer(id: string, Status: string, Note?: string, extra?: { CounterAmount?: number }) {
  const [row] = await db()
    .update(transferOffers)
    .set({ Status, Note: Note ?? null, ...extra, updatedAt: new Date() })
    .where(eq(transferOffers.id, id))
    .returning();
  return row;
}

/**
 * A club bids for a player who belongs to another club. An AI owner answers
 * immediately (accept -> the transfer happens now, counter, or refuse); a
 * human owner gets a pending offer to answer from their inbox.
 */
export async function placeBid(input: {
  playerId: string;
  biddingClubId: string;
  amount: number;
}) {
  await assertTransferWindowOpen();
  const { playerId, biddingClubId, amount } = input;

  const [player] = await db().select().from(players).where(eq(players.id, playerId));
  if (!player) throw new Error('Player not found');
  if (player.isRetired) throw new Error('This player has retired');
  if (!player.ClubId) throw new Error('He is a free agent - buy him outright instead of bidding');
  if (player.ClubId === biddingClubId) throw new Error('This player already belongs to your club');
  if (!(amount > 0)) throw new Error('Bid must be positive');

  const value = player.Value ?? 0;
  if (amount < value * MIN_BID_SHARE_OF_VALUE) {
    throw new Error(`Bid must be at least ${Math.round(value * MIN_BID_SHARE_OF_VALUE)} (half his value)`);
  }

  const [bidder] = await db().select().from(clubs).where(eq(clubs.id, biddingClubId));
  const [owner] = await db().select().from(clubs).where(eq(clubs.id, player.ClubId));
  if (!bidder) throw new Error('Bidding club not found');
  if (!owner) throw new Error('Owning club not found');
  if ((bidder.Budget ?? 0) < amount) throw new Error('Insufficient Budget for this bid');

  const open = await db()
    .select()
    .from(transferOffers)
    .where(and(eq(transferOffers.FromClubId, biddingClubId), inArray(transferOffers.Status, OPEN_STATUSES)));
  if (open.some((o) => o.PlayerId === playerId)) {
    throw new Error('You already have an open bid for this player');
  }
  if (open.length >= MAX_OPEN_BIDS_PER_CLUB) {
    throw new Error(`You can have at most ${MAX_OPEN_BIDS_PER_CLUB} open bids at once`);
  }

  const day = await currentDay();
  const [offer] = await db()
    .insert(transferOffers)
    .values({
      PlayerId: playerId,
      FromClubId: biddingClubId,
      ToClubId: owner.id,
      Amount: amount,
      Status: 'pending',
      Initiator: 'user',
      CreatedDay: day,
      ExpiresDay: day + OFFER_LIFETIME_DAYS,
      updatedAt: new Date(),
    })
    .returning();

  // A human owner answers from their inbox.
  if (owner.UserId) return offer;

  const { byClub } = await loadPlayers();
  const roster = byClub.get(owner.id) ?? [];
  const rosterPlayer = roster.find((p) => p.id === playerId);
  const response = aiResponse({
    amount,
    value,
    isKeyPlayer: rosterPlayer ? rankInRoster(rosterPlayer, roster) <= 3 : false,
    sellerSquadSize: roster.length,
  });

  if (response.decision === 'accepted') {
    return settleOffer(offer.id, amount);
  }
  if (response.decision === 'countered') {
    return finishOffer(offer.id, 'countered', `${owner.Name} want more`, { CounterAmount: response.ask });
  }
  return finishOffer(offer.id, 'rejected', response.reason);
}

/** Executes an agreed offer at `price`, marking it accepted (or failed with the reason). */
async function settleOffer(offerId: string, price: number) {
  const [offer] = await db().select().from(transferOffers).where(eq(transferOffers.id, offerId));
  const [player] = await db().select().from(players).where(eq(players.id, offer.PlayerId));
  const [buyer] = await db().select().from(clubs).where(eq(clubs.id, offer.FromClubId));

  const fail = async (reason: string) => {
    await finishOffer(offerId, 'failed', reason);
    throw new Error(reason);
  };

  if (!player || player.isRetired) return fail('The player is no longer available');
  if (player.ClubId !== offer.ToClubId) return fail('The player has already moved clubs');
  if ((buyer?.Budget ?? 0) < price) return fail('The bidding club can no longer afford this');

  await settleTransfer({
    playerId: offer.PlayerId,
    buyingClubId: offer.FromClubId,
    amount: price,
    note: `bid accepted (offer ${offerId})`,
  });
  return finishOffer(offerId, 'accepted', undefined, { CounterAmount: undefined });
}

/**
 * The club whose turn it is answers an offer: the owner for a 'pending' bid,
 * the bidder for a 'countered' one. Accepting executes the transfer at the
 * agreed price (bid amount, or the counter).
 */
export async function respondToOffer(input: {
  offerId: string;
  clubId: string;
  action: 'accept' | 'reject';
}) {
  const { offerId, clubId, action } = input;
  const [offer] = await db().select().from(transferOffers).where(eq(transferOffers.id, offerId));
  if (!offer) throw new Error('Offer not found');
  if (!OPEN_STATUSES.includes(offer.Status)) throw new Error(`This offer is already ${offer.Status}`);

  const responder = offer.Status === 'countered' ? offer.FromClubId : offer.ToClubId;
  if (clubId !== responder) throw new Error('It is not your turn to answer this offer');

  if (action === 'reject') return finishOffer(offerId, 'rejected', 'Declined');

  await assertTransferWindowOpen();
  const price = offer.Status === 'countered' ? (offer.CounterAmount ?? offer.Amount) : offer.Amount;
  return settleOffer(offerId, price);
}

export interface OfferView {
  id: string;
  status: string;
  initiator: string;
  amount: number;
  counterAmount: number | null;
  note: string | null;
  createdDay: number;
  expiresDay: number;
  /** 'me' when this club has to answer, 'them' when waiting on the other club, null when finished. */
  awaiting: 'me' | 'them' | null;
  direction: 'incoming' | 'outgoing';
  player: { id: string; name: string; position: string | null; rating: number; value: number };
  fromClub: { id: string; name: string; code: string };
  toClub: { id: string; name: string; code: string };
}

/** A club's offers, newest first (open ones and recently finished ones). */
export async function listOffers(clubId: string, limit = 40): Promise<OfferView[]> {
  const rows = await db()
    .select()
    .from(transferOffers)
    .where(or(eq(transferOffers.FromClubId, clubId), eq(transferOffers.ToClubId, clubId)))
    .orderBy(desc(transferOffers.createdAt))
    .limit(limit);
  if (!rows.length) return [];

  const clubRows = await db()
    .select({ id: clubs.id, Name: clubs.Name, ClubCode: clubs.ClubCode })
    .from(clubs)
    .where(inArray(clubs.id, [...new Set(rows.flatMap((r) => [r.FromClubId, r.ToClubId]))]));
  const playerRows = await db()
    .select({
      id: players.id,
      FirstName: players.FirstName,
      LastName: players.LastName,
      Position: players.Position,
      Rating: players.Rating,
      Value: players.Value,
    })
    .from(players)
    .where(inArray(players.id, [...new Set(rows.map((r) => r.PlayerId))]));

  const clubById = new Map(clubRows.map((c) => [c.id, { id: c.id, name: c.Name, code: c.ClubCode }]));
  const playerById = new Map(playerRows.map((p) => [p.id, p]));

  return rows.map((r) => {
    const player = playerById.get(r.PlayerId);
    const open = OPEN_STATUSES.includes(r.Status);
    const responder = r.Status === 'countered' ? r.FromClubId : r.ToClubId;
    return {
      id: r.id,
      status: r.Status,
      initiator: r.Initiator,
      amount: r.Amount,
      counterAmount: r.CounterAmount,
      note: r.Note,
      createdDay: r.CreatedDay,
      expiresDay: r.ExpiresDay,
      awaiting: open ? (responder === clubId ? 'me' : 'them') : null,
      direction: r.ToClubId === clubId ? 'incoming' : 'outgoing',
      player: {
        id: r.PlayerId,
        name: player ? `${player.FirstName} ${player.LastName}` : 'Unknown player',
        position: player?.Position ?? null,
        rating: player?.Rating ?? 0,
        value: player?.Value ?? 0,
      },
      fromClub: clubById.get(r.FromClubId) ?? { id: r.FromClubId, name: '?', code: '?' },
      toClub: clubById.get(r.ToClubId) ?? { id: r.ToClubId, name: '?', code: '?' },
    };
  });
}

export interface TransferDaySummary {
  expired: number;
  aiBids: number;
  aiDeals: number;
}

/**
 * Called once per game day the calendar advances. Expires stale offers and,
 * while the window is open, lets the AI clubs act: bid for human clubs'
 * players (answered from the human's inbox) and trade among themselves.
 */
export async function runTransferDay(day: number): Promise<TransferDaySummary> {
  const summary: TransferDaySummary = { expired: 0, aiBids: 0, aiDeals: 0 };

  const expired = await db()
    .update(transferOffers)
    .set({ Status: 'expired', Note: 'No answer in time', updatedAt: new Date() })
    .where(and(inArray(transferOffers.Status, OPEN_STATUSES), lt(transferOffers.ExpiresDay, day)))
    .returning({ id: transferOffers.id });
  summary.expired = expired.length;

  const window = await getTransferWindow();
  if (!window.open) return summary;

  const [allClubs, { byClub, freeAgents }] = await Promise.all([loadClubs(), loadPlayers()]);
  const humanClubs = allClubs.filter((c) => c.UserId);
  const aiClubs = allClubs.filter((c) => !c.UserId);
  const budgets = new Map(allClubs.map((c) => [c.id, c.Budget]));

  // 1. AI clubs bid for human clubs' players.
  const openOffers = await db()
    .select()
    .from(transferOffers)
    .where(inArray(transferOffers.Status, OPEN_STATUSES));

  for (const human of humanClubs) {
    const pendingIncoming = openOffers.filter((o) => o.ToClubId === human.id && o.Status === 'pending');
    if (pendingIncoming.length >= MAX_PENDING_OFFERS_PER_HUMAN_CLUB) continue;
    if (Math.random() > AI_BID_CHANCE_PER_DAY) continue;

    const roster = byClub.get(human.id) ?? [];
    if (roster.length <= MIN_SQUAD_SIZE) continue;
    const alreadyBidOn = new Set(openOffers.map((o) => o.PlayerId));
    const candidates = roster.filter((p) => !alreadyBidOn.has(p.id) && p.Value > 0);
    if (!candidates.length) continue;

    // Better players attract more interest.
    const weighted = candidates.flatMap((p) => Array(Math.max(1, Math.round(p.Rating / 20))).fill(p) as RosterPlayer[]);
    const target = pick(weighted);
    if (!target) continue;

    const amount = Math.round(target.Value * rand(0.95, 1.35));
    const bidders = aiClubs
      .filter(
        (c) =>
          (budgets.get(c.id) ?? 0) >= amount * 1.2 &&
          (byClub.get(c.id)?.length ?? 0) < MAX_SQUAD_SIZE &&
          improvesSquad(target, byClub.get(c.id) ?? [])
      )
      .sort(() => Math.random() - 0.5);
    const bidder = bidders[0];
    if (!bidder) continue;

    await db().insert(transferOffers).values({
      PlayerId: target.id,
      FromClubId: bidder.id,
      ToClubId: human.id,
      Amount: amount,
      Status: 'pending',
      Initiator: 'ai',
      CreatedDay: day,
      ExpiresDay: day + OFFER_LIFETIME_DAYS,
      updatedAt: new Date(),
    });
    summary.aiBids++;
  }

  // 2. AI clubs trade with each other and sign free agents.
  for (let i = 0; i < AI_DEALS_PER_DAY; i++) {
    if (Math.random() > AI_DEAL_CHANCE) continue;

    const buyer = pick(
      aiClubs.filter(
        (c) => (budgets.get(c.id) ?? 0) > 3_000_000 && (byClub.get(c.id)?.length ?? 0) < MAX_SQUAD_SIZE
      )
    );
    if (!buyer) continue;
    const buyerRoster = byClub.get(buyer.id) ?? [];
    const buyerBudget = budgets.get(buyer.id) ?? 0;

    const aiClubIds = new Set(aiClubs.map((c) => c.id));
    const pool: { player: RosterPlayer; price: number; free: boolean }[] = [];
    for (const p of freeAgents) {
      pool.push({ player: p, price: Math.round(p.Value * 0.6), free: true });
    }
    for (const [clubId, roster] of byClub) {
      if (clubId === buyer.id || !aiClubIds.has(clubId) || roster.length <= MIN_SQUAD_SIZE) continue;
      for (const p of roster) pool.push({ player: p, price: Math.round(p.Value * 1.15), free: false });
    }

    const options = pool
      .filter(
        (o) =>
          o.player.Value > 0 &&
          buyerBudget >= o.price * 1.5 &&
          improvesSquad(o.player, buyerRoster)
      )
      .sort(() => Math.random() - 0.5)
      .slice(0, 30)
      .sort((a, b) => b.player.Rating - a.player.Rating);
    const chosen = options[0];
    if (!chosen) continue;

    try {
      await settleTransfer({
        playerId: chosen.player.id,
        buyingClubId: buyer.id,
        amount: chosen.price,
        note: chosen.free ? 'ai free-agent signing' : 'ai transfer',
      });
    } catch (error) {
      console.error('[transfer-market] AI deal failed:', error);
      continue;
    }

    // Keep the in-memory picture consistent for the rest of today's deals.
    budgets.set(buyer.id, buyerBudget - chosen.price);
    if (chosen.free) {
      freeAgents.splice(freeAgents.indexOf(chosen.player), 1);
    } else if (chosen.player.ClubId) {
      const sellerRoster = byClub.get(chosen.player.ClubId) ?? [];
      byClub.set(chosen.player.ClubId, sellerRoster.filter((p) => p.id !== chosen.player.id));
      budgets.set(chosen.player.ClubId, (budgets.get(chosen.player.ClubId) ?? 0) + chosen.price);
    }
    byClub.set(buyer.id, [...buyerRoster, { ...chosen.player, ClubId: buyer.id }]);
    summary.aiDeals++;
  }

  return summary;
}
