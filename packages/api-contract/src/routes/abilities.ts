// packages/api-contract/src/routes/abilities.ts
//
// Gated abilities, traits and Manager Orders (docs/coc-mapping/05 §3, 03 Part 2,
// 08 §2). Club-scoped screens read a club's squad loadout and syllabus; the
// player routes slot an ability / equip a trait; the War Room inventory holds
// the prepared Match Orders. The heavy per-player payloads are returned as the
// Go registry-shaped objects and validated loosely here (the authoritative
// shape lives in internal/abilities); the trait catalogue is concrete.
//
// Three routers live here so the derived route ids match the Go manifest exactly:
//   abilities.list / abilities.slot
//   traits.list    / traits.equip
//   orders.inventory / orders.prepare

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { TraitRaritySchema } from '../schemas/ability';

const clubParam = z.object({ id: z.string() });
const playerParam = z.object({ id: z.string(), pid: z.string() });

const TraitEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rarity: TraitRaritySchema,
  effect: z.string(),
});

const c = initContract();

export const abilitiesContract = c.router(
  {
    /** A club's per-player ability syllabus, mastery and slotted loadout. */
    list: {
      method: 'GET',
      path: '/clubs/:id/abilities',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(z.unknown()),
        404: failEnvelope(),
      },
    },

    /** Slot (or refresh) an ability on a player; enforces facility + mastery +
     * slot-cap gates and returns the player's loadout. */
    slot: {
      method: 'POST',
      path: '/clubs/:id/players/:pid/abilities',
      pathParams: playerParam,
      body: z.object({ abilityId: z.string() }),
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
  },
  { strictStatusCodes: true }
);

export const traitsContract = c.router(
  {
    /** The global trait catalogue (public). */
    list: {
      method: 'GET',
      path: '/traits',
      responses: {
        200: successEnvelope(
          z.object({
            traits: z.array(TraitEntrySchema),
            rarities: z.array(TraitRaritySchema),
            maxSlots: z.number().int(),
          })
        ),
      },
    },

    /** Equip a trait into one of a player's two slots. */
    equip: {
      method: 'POST',
      path: '/clubs/:id/players/:pid/traits',
      pathParams: playerParam,
      body: z.object({ traitId: z.string(), slot: z.number().int() }),
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
  },
  { strictStatusCodes: true }
);

export const ordersContract = c.router(
  {
    /** The Tactical War Room order inventory. */
    inventory: {
      method: 'GET',
      path: '/clubs/:id/orders',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(z.unknown()),
        404: failEnvelope(),
      },
    },

    /** Prepare (buy) Manager Orders into the War Room inventory. */
    prepare: {
      method: 'POST',
      path: '/clubs/:id/orders',
      pathParams: clubParam,
      body: z.object({ orderId: z.string(), count: z.number().int() }),
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
  },
  { strictStatusCodes: true }
);
