// packages/api-contract/src/routes/clubs.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ClubSchema } from '../schemas/club';
import { PlayerSchema } from '../schemas/player';
import { ClubPerformanceSchema } from '../schemas/club-performance';
import { MediaItemSchema } from '../schemas/media';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { booleanQuery } from '../schemas/query';

const SlotPosSchema = z.enum(['GK', 'DEF', 'MID', 'ATT']);
const ApproachSchema = z.enum(['balanced', 'attacking', 'solid']);

const LineupSuggestionSchema = z.object({
  approach: ApproachSchema,
  source: z.enum(['jev', 'local']),
  confidence: z.number().nullable(),
  reasoning: z.string(),
  starters: z.array(
    z.object({
      slot: z.number(),
      label: z.string(),
      slotPos: SlotPosSchema,
      playerId: z.string(),
      playerName: z.string(),
      naturalPos: SlotPosSchema,
      rating: z.number(),
      outOfPosition: z.boolean(),
    })
  ),
  bench: z.array(z.string()),
  candidates: z.array(
    z.object({
      approach: ApproachSchema,
      score: z.number(),
      outOfPosition: z.number(),
      avgRating: z.number(),
    })
  ),
  excludedInjured: z.array(z.string()),
});

const c = initContract();

// Writable subset of Club - excludes populate-only/server-computed fields
// (Players, Manager as an object, AddressCountry, _id, timestamps, Records).
// Used for both create (client currently only ever sends
// Name/ClubCode/Address/Stadium) and update (plain partial fields, matching
// club.service.ts's own `Partial<ClubInterface>` acceptance).
const ClubWriteSchema = ClubSchema.omit({
  _id: true,
  Players: true,
  Manager: true,
  AddressCountry: true,
  Records: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const clubsContract = c.router(
  {
    getClubs: {
      method: 'GET',
      path: '/all',
      query: z.object({
        ids: z.string().optional(),
        unclaimed: booleanQuery().optional(),
        withPlayersAndManager: booleanQuery().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(ClubSchema)),
        400: failEnvelope(),
      },
    },

    getClub: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        populate: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(ClubSchema),
        404: failEnvelope(),
      },
    },

    // Results, expected results, squad strength and plain-language findings
    // explaining how a club is doing. `year` picks a season cycle (default: the latest).
    getClubPerformance: {
      method: 'GET',
      path: '/:id/performance',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        year: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(ClubPerformanceSchema),
        404: failEnvelope(),
        400: failEnvelope(),
      },
    },

    // Suggests a starting XI + bench for a formation: candidate lineups are
    // built locally, Jev picks the approach, and the local emulator stands by
    // when Jev is unavailable.
    suggestLineup: {
      method: 'POST',
      path: '/:id/lineup-suggestion',
      pathParams: z.object({ id: z.string() }),
      body: z.object({
        formation: z.string(),
        style: z.string().optional(),
        slots: z
          .array(z.object({ label: z.string(), pos: z.enum(['GK', 'DEF', 'MID', 'ATT']) }))
          .length(11),
      }),
      responses: {
        200: successEnvelope(LineupSuggestionSchema),
        404: failEnvelope(),
        400: failEnvelope(),
      },
    },

    createClub: {
      method: 'POST',
      path: '/new',
      body: ClubWriteSchema,
      responses: {
        200: successEnvelope(ClubSchema),
        400: failEnvelope(),
      },
    },

    updateClub: {
      method: 'POST',
      path: '/:id/update',
      pathParams: z.object({
        id: z.string(),
      }),
      body: ClubWriteSchema,
      responses: {
        200: successEnvelope(ClubSchema),
        400: failEnvelope(),
      },
    },

    deleteClub: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(ClubSchema),
        400: failEnvelope(),
      },
    },

    addPlayerToClub: {
      method: 'PUT',
      path: '/:id/add-player',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        remove: booleanQuery().optional(),
      }),
      body: z.object({
        playerId: z.string(),
        isSigned: z.boolean(),
        clubCode: z.string().nullable().optional(),
        clubId: z.string().nullable().optional(),
      }),
      responses: {
        200: successEnvelope(ClubSchema),
        400: failEnvelope(),
      },
    },

    addManyPlayersToClub: {
      method: 'PUT',
      path: '/:id/add-many-players',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.object({
        playerIds: z.array(z.string()),
        clubId: z.string(),
        clubCode: z.string(),
      }),
      responses: {
        200: successEnvelope(ClubSchema),
        400: failEnvelope(),
      },
    },

    // ! THIS WAS FOR DEVELOPMENT ! (carried over from the legacy route's
    // own comment - recomputes every Club's ratings at once)
    refreshAllClubsRatings: {
      method: 'PUT',
      path: '/refresh-ratings',
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(z.object({})),
        400: failEnvelope(),
      },
    },

    hireManager: {
      method: 'PUT',
      path: '/:id/manager',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.object({
        manager: z.string(),
        details: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.object({})),
        400: failEnvelope(),
        401: failEnvelope(),
      },
    },

    fireManager: {
      method: 'DELETE',
      path: '/:id/manager',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        reason: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.object({})),
        400: failEnvelope(),
      },
    },

    recruitYouthPlayers: {
      method: 'POST',
      path: '/:id/recruit-youth',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.object({
        count: z.number().int().min(1).max(3).optional(),
      }),
      responses: {
        200: successEnvelope(z.array(PlayerSchema)),
        400: failEnvelope(),
      },
    },

    removePlayerFromClub: {
      method: 'PUT',
      path: '/:id/remove-player',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        remove: booleanQuery().optional(),
      }),
      body: z.object({
        playerId: z.string(),
        isSigned: z.boolean(),
        clubCode: z.string().nullable().optional(),
        clubId: z.string().nullable().optional(),
      }),
      responses: {
        200: successEnvelope(ClubSchema),
        400: failEnvelope(),
      },
    },

    getMediaFeed: {
      method: 'GET',
      path: '/:id/media-feed',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        fixtureId: z.string().optional(),
        competitionCode: z.string().optional(),
        channel: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(MediaItemSchema)),
        400: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/clubs', strictStatusCodes: true }
);
