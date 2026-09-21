import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import { getPlayState, playMatch } from '../../services/play/play.service';
import { accessDenied, canManageClub } from '../auth/club-access';

const s = initServer();

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: /not found/i.test(message) ? (404 as const) : (400 as const),
    body: { success: false as const, message, payload: message },
  };
}

export const playTsRestRoutes = s.router(contract.play, {
  getPlayState: async ({ params }) => {
    try {
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Play state', payload: await getPlayState(params.clubId) },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  playMatch: async ({ params, req }) => {
    try {
      const access = await canManageClub(req.session as { userID?: string } | undefined, params.clubId);
      if (access !== 'ok') return accessDenied(access);

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Match played', payload: await playMatch(params.clubId) },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },
});
