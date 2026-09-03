// packages/api-contract/src/routes/seasons.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { SeasonSchema, ClubStandingsSchema } from '../schemas/season';
import { FixtureSchema } from '../schemas/fixture';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { booleanQuery } from '../schemas/query';

const c = initContract();

export const seasonsContract = c.router(
  {
    // The real client filters are Year, Competition, and `current` (a
    // competition's in-progress season - isStarted && !isFinished, there's
    // only ever one at a time) - the previous arbitrary `?query={...}`
    // JSON blob had no other caller.
    getSeasons: {
      method: 'GET',
      path: '/',
      query: z.object({
        year: z.string().optional(),
        competition: z.string().optional(),
        current: booleanQuery().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(SeasonSchema)),
        400: failEnvelope(),
      },
    },

    createSeason: {
      method: 'POST',
      path: '/',
      body: z.object({
        CompetitionCode: z.string(),
        CompetitionId: z.string(),
        Title: z.string().optional(),
        StartDate: z.string().optional(),
        EndDate: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(SeasonSchema),
        400: failEnvelope(),
      },
    },

    generateFixtures: {
      method: 'POST',
      path: '/:id/:code/generate-fixtures',
      pathParams: z.object({
        id: z.string(),
        code: z.string(),
      }),
      body: z.object({
        competitionId: z.string(),
        leagueCode: z.string(),
      }),
      responses: {
        200: successEnvelope(SeasonSchema),
        400: failEnvelope(),
      },
    },

    startSeason: {
      method: 'PATCH',
      path: '/:id/start',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(SeasonSchema),
        400: failEnvelope(),
      },
    },

    /** Prolegates the Season's Standings into Promoted/Relegated, marks it
     * finished, then hands out Season awards - extracted from the old
     * finishSeason -> giveAwards Express middleware chain. */
    finishSeason: {
      method: 'POST',
      path: '/:id/finish',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(
          z.object({
            awardedPlayers: z.array(z.unknown()),
            standings: z.array(ClubStandingsSchema),
            season: SeasonSchema,
          })
        ),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    getSeasonFixtures: {
      method: 'GET',
      path: '/:id/fixtures',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(z.array(FixtureSchema)),
        400: failEnvelope(),
      },
    },

    getCurrentSeasonsForYear: {
      method: 'GET',
      path: '/:year/current',
      pathParams: z.object({
        year: z.string(),
      }),
      responses: {
        200: successEnvelope(z.array(SeasonSchema)),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    getSeason: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(SeasonSchema.nullable()),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    getSeasonStandings: {
      method: 'GET',
      path: '/:id/standings',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(z.array(ClubStandingsSchema)),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    deleteSeason: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(z.object({})),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/seasons', strictStatusCodes: true }
);
