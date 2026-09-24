import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, users } from '../../db/drizzle/schema';

export type ClubAccess = 'ok' | 'unauthenticated' | 'forbidden' | 'not_found';

/** Only the club's owner, or an admin, may act for the club (spend its money,
 * play its matches). `session` is the express session (`req.session`). */
export async function canManageClub(
  session: { userID?: string } | undefined,
  clubId: string
): Promise<ClubAccess> {
  const userId = session?.userID;
  if (!userId) return 'unauthenticated';

  const db = DrizzleDatabase.getInstance().database;
  const club = await db.query.clubs.findFirst({ where: eq(clubs.id, clubId) });
  if (!club) return 'not_found';
  if (club.UserId === userId) return 'ok';

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return user?.isAdmin ? 'ok' : 'forbidden';
}

/** The ts-rest error response for a non-'ok' access result. */
export function accessDenied(access: Exclude<ClubAccess, 'ok'>) {
  if (access === 'unauthenticated') {
    return { status: 401 as const, body: { success: false as const, message: 'Not logged in' } };
  }
  if (access === 'forbidden') {
    return {
      status: 403 as const,
      body: { success: false as const, message: 'You do not manage this club' },
    };
  }
  return { status: 404 as const, body: { success: false as const, message: 'Club not found' } };
}
