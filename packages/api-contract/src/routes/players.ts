// packages/api-contract/src/routes/players.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { PlayerSchema } from '../schemas/player';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { booleanQuery } from '../schemas/query';

const c = initContract();

// Writable subset of Player - excludes populate-only/server-computed
// fields.
const PlayerWriteSchema = PlayerSchema.omit({
  _id: true,
  RatingsHistory: true,
  createdAt: true,
  updatedAt: true,
}).partial();

/** GET /players/stats's response uses a genuinely different, less-normalized
 * shape than the rest of the Player API - a raw SQL aggregation attaches a
 * nested `player` object whose Attributes uses `SetPiece` (capital P) and
 * whose nationality key is lowercase `nationality`, unlike every other
 * Player read path (see schemas/player.ts's comment). Modeled as its own
 * loose schema rather than forced through PlayerSchema. */
const PlayerStatsEntrySchema = z
  .object({
    _id: z.string(),
    goals: z.number(),
    saves: z.number(),
    passes: z.number(),
    tackles: z.number(),
    assists: z.number(),
    clean_sheets: z.number(),
    dribbles: z.number(),
    points: z.number(),
    form: z.number(),
    player: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const playersContract = c.router(
  {
    getPlayers: {
      method: 'GET',
      path: '/all',
      query: z.object({
        club: z.string().optional(),
        clubCode: z.string().optional(),
        isSigned: booleanQuery().optional(),
        // "Every signed player except this club's own roster" - the
        // Transfer Market's "other clubs' players" browse query.
        excludeClubId: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(PlayerSchema)),
        400: failEnvelope(),
      },
    },

    updatePlayer: {
      method: 'POST',
      path: '/:id/update',
      pathParams: z.object({
        id: z.string(),
      }),
      body: PlayerWriteSchema,
      responses: {
        200: successEnvelope(PlayerSchema),
        400: failEnvelope(),
      },
    },

    createPlayer: {
      method: 'POST',
      path: '/new',
      body: PlayerWriteSchema,
      responses: {
        200: successEnvelope(PlayerSchema),
        400: failEnvelope(),
      },
    },

    getPlayerRating: {
      method: 'GET',
      path: '/:id/rating',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(
          z.object({ new_rating: z.number(), new_value: z.number() })
        ),
        400: failEnvelope(),
      },
    },

    // Use like this -> /players/stats?competitionCode=EFL&sortBy=goals&sortDir=desc
    getPlayerStats: {
      method: 'GET',
      path: '/stats',
      query: z.object({
        competitionCode: z.string().optional(),
        sortBy: z
          .enum([
            'goals',
            'saves',
            'passes',
            'tackles',
            'assists',
            'clean_sheets',
            'dribbles',
            'points',
            'form',
          ])
          .optional(),
        sortDir: z.enum(['asc', 'desc']).optional(),
      }),
      responses: {
        200: successEnvelope(z.array(PlayerStatsEntrySchema)),
        400: failEnvelope(),
      },
    },

    // Dev-only helper - shells out to a child process (see runSpawn in the
    // server handler) to generate and persist a batch of new Players.
    generatePlayers: {
      method: 'GET',
      path: '/generate-players',
      query: z.object({
        number: z.string(),
        culture: z.string(),
        position: z.string(),
      }),
      responses: {
        200: successEnvelope(z.array(PlayerSchema)),
        400: failEnvelope(),
      },
    },

    getPlayer: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(PlayerSchema),
        400: failEnvelope(),
      },
    },

    deletePlayer: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(PlayerSchema),
        400: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/players', strictStatusCodes: true }
);
