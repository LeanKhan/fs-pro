import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, users } from '../../db/drizzle/schema';
import { issueTicket, realtimeConfig } from '../../realtime/world-events';

/**
 * GET /api/realtime/ticket - a short-lived signed ticket for the multiplayer
 * gateway (apps/fs-pro-realtime), from the signed-in user's session. The
 * gateway trusts the ticket's claims (who you are, which clubs you own) and
 * never touches the session store or the database itself.
 */
export const realtimeRouter = Router();

realtimeRouter.get('/ticket', async (req: Request, res: Response) => {
  const userId = (req.session as { userID?: string } | undefined)?.userID;
  if (!userId) return res.status(401).json({ success: false, message: 'Not logged in' });

  const db = DrizzleDatabase.getInstance().database;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return res.status(401).json({ success: false, message: 'Not logged in' });
  const owned = await db
    .select({ id: clubs.id, code: clubs.ClubCode })
    .from(clubs)
    .where(eq(clubs.UserId, userId));

  const { publicUrl, enabled } = realtimeConfig();
  if (!enabled) return res.status(503).json({ success: false, message: 'Realtime is off' });
  const ticket = issueTicket({
    uid: user.id,
    name: user.FullName || user.Username,
    clubs: owned.map((c) => c.id),
    code: owned[0]?.code,
    admin: user.isAdmin || undefined,
  });
  return res.json({ success: true, message: 'Ticket', payload: { url: `${publicUrl}/ws`, ticket } });
});
