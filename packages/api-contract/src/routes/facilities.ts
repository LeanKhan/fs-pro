// packages/api-contract/src/routes/facilities.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  CampusSchema,
  MedicalStatusSchema,
  PlayerTreatmentRequestSchema,
  PlayerTreatmentResponseSchema,
  SquadRecoveryResponseSchema,
} from '../schemas/facilities';

const c = initContract();

export const facilitiesContract = c.router(
  {
    /** A club's facilities: current levels, running upgrades and the price /
     * availability of every next level. */
    getCampus: {
      method: 'GET',
      path: '/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(CampusSchema),
        404: failEnvelope(),
      },
    },

    /** Pay for and start the next level of an asset. Completes after N game
     * days (resolved by the calendar tick, so it progresses offline). Only the
     * club's owner (or an admin) may do this. */
    startUpgrade: {
      method: 'POST',
      path: '/:clubId/upgrade',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({ assetType: z.string() }),
      responses: {
        200: successEnvelope(CampusSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Medical Centre status: available treatment bays, injured/fatigued squad members,
     * treatment costs, and squad recovery availability. */
    getMedicalStatus: {
      method: 'GET',
      path: '/:clubId/medical',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(MedicalStatusSchema),
        404: failEnvelope(),
      },
    },

    /** Trigger a whole-squad cryotherapy & recovery session (+30 fitness, -1 injury day). */
    squadRecovery: {
      method: 'POST',
      path: '/:clubId/medical/squad-recovery',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({}),
      responses: {
        200: successEnvelope(SquadRecoveryResponseSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Concentrate medical efforts on a specific player (intensive rehab, hyperbaric conditioning, or specialist surgery). */
    treatPlayer: {
      method: 'POST',
      path: '/:clubId/medical/treat-player',
      pathParams: z.object({ clubId: z.string() }),
      body: PlayerTreatmentRequestSchema,
      responses: {
        200: successEnvelope(PlayerTreatmentResponseSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/facilities', strictStatusCodes: true }
);

