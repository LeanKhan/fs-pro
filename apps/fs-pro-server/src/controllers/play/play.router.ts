import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import { findOpponents, getPlayState, playMatch } from '../../services/play/play.service';
import { collectShop } from '../../services/play/shop';
import { PrepError, bookMatch, getMatchPrep, getMatchday, previewMatchPlan, saveMatchPlan } from '../../services/play/match-plan.service';
import { getInbox, markInboxRead } from '../../services/world/club-standing.service';
import { accessDenied, canManageClub } from '../auth/club-access';
import { ProgramGateError } from '../../services/program/squad-gate';

const s = initServer();

const ok = <T>(message: string, payload: T) => ({ status: 200 as const, body: { success: true as const, message, payload } });

/** Owner (or admin) only; errors become 400/403/404 envelopes. */
function ownerOnly<A extends { params: { clubId: string }; req: { session?: unknown } }, R>(fn: (args: A) => Promise<R>) {
  return async (args: A) => {
    try {
      const access = await canManageClub(args.req.session as { userID?: string } | undefined, args.params.clubId);
      if (access !== 'ok') return accessDenied(access);
      return await fn(args);
    } catch (err) {
      return errorResponse(err) as any;
    }
  };
}

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    err instanceof PrepError
      ? err.status
      : err instanceof ProgramGateError
        ? (err.status as 409)
        : /not found/i.test(message)
          ? (404 as const)
          : (400 as const);
  return {
    status,
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
        body: { success: true as const, message: 'Match played', payload: await playMatch(params.clubId, body?.opponentId, { watch: body?.watch === true }) },
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

  collectShop: async ({ params, req }) => {
    try {
      const access = await canManageClub(req.session as { userID?: string } | undefined, params.clubId);
      if (access !== 'ok') return accessDenied(access);
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Shop takings collected', payload: await collectShop(params.clubId) },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  getMatchday: ownerOnly(async ({ params }) => ok('Match day', await getMatchday(params.clubId))),
  bookMatch: ownerOnly(async ({ params, body }) => ok('Match booked', await bookMatch(params.clubId, body.opponentId))),
  getMatchPrep: ownerOnly(async ({ params }) => ok('Match prep', await getMatchPrep(params.clubId, params.fixtureId))),
  saveMatchPlan: ownerOnly(async ({ params, body }) =>
    ok('Plan saved', await saveMatchPlan(params.clubId, params.fixtureId, body.plan, body.asDefault === true))
  ),
  previewMatchPlan: ownerOnly(async ({ params, body }) => ok('Plan preview', await previewMatchPlan(params.clubId, params.fixtureId, body.plan))),

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
