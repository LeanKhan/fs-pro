import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import { findOpponents, getPlayState, playMatch } from '../../services/play/play.service';
import { getInbox, markInboxRead } from '../../services/world/club-standing.service';
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

  findOpponents: async ({ params }) => {
    try {
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Opponent options',
          payload: await findOpponents(params.clubId),
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  playMatch: async ({ params, body, req }) => {
    try {
      const access = await canManageClub(req.session as { userID?: string } | undefined, params.clubId);
      if (access !== 'ok') return accessDenied(access);

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Match played', payload: await playMatch(params.clubId, body?.opponentId) },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  getInbox: async ({ params, req }) => {
    try {
      const access = await canManageClub(req.session as { userID?: string } | undefined, params.clubId);
      if (access !== 'ok') return accessDenied(access);
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Inbox', payload: await getInbox(params.clubId) },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  markInboxRead: async ({ params, req }) => {
    try {
      const access = await canManageClub(req.session as { userID?: string } | undefined, params.clubId);
      if (access !== 'ok') return accessDenied(access);
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Inbox read', payload: await markInboxRead(params.clubId) },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },
});
