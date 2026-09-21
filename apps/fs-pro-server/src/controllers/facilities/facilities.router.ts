import { initServer } from '@ts-rest/express';
import { eq } from 'drizzle-orm';
import { apiContract as contract } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, users } from '../../db/drizzle/schema';
import { getCampus, startUpgrade } from '../../services/facilities/facilities.service';

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

/** Only the club's owner, or an admin, may spend the club's money. */
async function canManageClub(
  session: { userID?: string } | undefined,
  clubId: string
): Promise<'ok' | 'unauthenticated' | 'forbidden' | 'not_found'> {
  const userId = session?.userID;
  if (!userId) return 'unauthenticated';

  const db = DrizzleDatabase.getInstance().database;
  const club = await db.query.clubs.findFirst({ where: eq(clubs.id, clubId) });
  if (!club) return 'not_found';
  if (club.UserId === userId) return 'ok';

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return user?.isAdmin ? 'ok' : 'forbidden';
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
      if (access === 'unauthenticated') {
        return { status: 401 as const, body: { success: false as const, message: 'Not logged in' } };
      }
      if (access === 'forbidden') {
        return {
          status: 403 as const,
          body: { success: false as const, message: 'You do not manage this club' },
        };
      }
      if (access === 'not_found') {
        return { status: 404 as const, body: { success: false as const, message: 'Club not found' } };
      }

      const campus = await startUpgrade(params.clubId, body.assetType);
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Upgrade started', payload: campus },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },
});
