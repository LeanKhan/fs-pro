import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import { accessDenied, canManageClub } from '../auth/club-access';
import { getCampus, startUpgrade } from '../../services/facilities/facilities.service';
import {
  getMedicalStatus,
  executeSquadRecovery,
  executePlayerTreatment,
} from '../../services/facilities/medical.service';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function errorResponse(err: unknown) {
  const message = fail(err);
  return {
    status: /not found/i.test(message) ? (404 as const) : (400 as const),
    body: { success: false as const, message, payload: message },
  };
}

export const facilitiesTsRestRoutes = s.router(contract.facilities, {
  getCampus: async ({ params }) => {
    try {
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Club facilities',
          payload: await getCampus(params.clubId),
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  startUpgrade: async ({ params, body, req }) => {
    try {
      const access = await canManageClub(req.session as { userID?: string } | undefined, params.clubId);
      if (access !== 'ok') return accessDenied(access);

      const campus = await startUpgrade(params.clubId, body.assetType);
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Upgrade started', payload: campus },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  getMedicalStatus: async ({ params }) => {
    try {
      const status = await getMedicalStatus(params.clubId);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Medical Centre status',
          payload: status,
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  squadRecovery: async ({ params, req }) => {
    try {
      const access = await canManageClub(req.session as { userID?: string } | undefined, params.clubId);
      if (access !== 'ok') return accessDenied(access);

      const result = await executeSquadRecovery(params.clubId);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: result.message,
          payload: result,
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  treatPlayer: async ({ params, body, req }) => {
    try {
      const access = await canManageClub(req.session as { userID?: string } | undefined, params.clubId);
      if (access !== 'ok') return accessDenied(access);

      const result = await executePlayerTreatment(params.clubId, body.playerId, body.treatmentType);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: result.message,
          payload: result,
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },
});
