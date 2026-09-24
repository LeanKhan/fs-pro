import { z } from 'zod';

export const TransferWindowSchema = z.object({
  open: z.boolean(),
  /** Last game day the window is open; null = no scheduled close. */
  closesDay: z.number().nullable(),
  currentDay: z.number(),
  daysLeft: z.number().nullable(),
});

const OfferClubSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
});

/** A bid between two clubs, from the point of view of the club asking. */
export const TransferOfferSchema = z.object({
  id: z.string(),
  /** pending | countered | accepted | rejected | expired | failed */
  status: z.string(),
  /** Who made the bid: 'user' (a human club) or 'ai'. */
  initiator: z.string(),
  amount: z.number(),
  counterAmount: z.number().nullable(),
  note: z.string().nullable(),
  createdDay: z.number(),
  expiresDay: z.number(),
  /** 'me' = this club has to answer, 'them' = waiting on the other club. */
  awaiting: z.enum(['me', 'them']).nullable(),
  direction: z.enum(['incoming', 'outgoing']),
  player: z.object({
    id: z.string(),
    name: z.string(),
    position: z.string().nullable(),
    rating: z.number(),
    value: z.number(),
  }),
  fromClub: OfferClubSchema,
  toClub: OfferClubSchema,
});

/** Scouting Department facility feature: an AI-recommended transfer target
 * (see services/transfers/scouted-shortlist.service.ts). Light card data -
 * the full deep-dive analysis is `scoutPlayerTransfer`'s response. */
export const ScoutedTargetSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  rating: z.number(),
  value: z.number(),
  isListed: z.boolean(),
  askingPrice: z.number().nullable(),
});

export type TransferWindow = z.infer<typeof TransferWindowSchema>;
export type TransferOffer = z.infer<typeof TransferOfferSchema>;
export type ScoutedTarget = z.infer<typeof ScoutedTargetSchema>;
