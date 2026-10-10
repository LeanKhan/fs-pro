import { Router, type Request, type Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, users } from '../../db/drizzle/schema';
import { associationIdsFrom, gatewayAdmin, issueTicket, realtimeConfig } from '../../realtime/world-events';

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

  // The association rooms a member club may join. `AssociationMembers` is a
  // CoC-mapping table (migration 0049) with no Drizzle model, so it is read
  // raw; the gateway only ever sees the resulting `assocs` claim.
  const clubIds = owned.map((c) => c.id);
  const assocs = clubIds.length
    ? associationIdsFrom(
        (await db.execute(sql`
          SELECT DISTINCT "AssociationId"
          FROM "AssociationMembers"
          WHERE "ClubId" IN (${sql.join(
            clubIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        `)) as unknown as Array<{ AssociationId?: unknown }>
      )
    : [];

  const { publicUrl, enabled } = realtimeConfig();
  if (!enabled) return res.status(503).json({ success: false, message: 'Realtime is off' });
  const ticket = issueTicket({
    uid: user.id,
    name: user.FullName || user.Username,
    clubs: clubIds,
    assocs: assocs.length ? assocs : undefined,
    code: owned[0]?.code,
    admin: user.isAdmin || undefined,
    // Unconfirmed accounts can read chat but not write it. Mirrors the
    // founding rule (REQUIRE_VERIFIED_EMAIL); admins and imagination-login
    // accounts are exempt.
    ver:
      process.env.REQUIRE_VERIFIED_EMAIL?.trim() !== 'true' || user.isAdmin || !!user.accountId || !!user.EmailVerifiedAt || undefined,
  });
  return res.json({ success: true, message: 'Ticket', payload: { url: `${publicUrl}/ws`, ticket } });
});

/** Admin-only chat moderation, through the gateway's signed endpoints. */
async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = (req.session as { userID?: string } | undefined)?.userID;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Not logged in' });
    return false;
  }
  const [user] = await DrizzleDatabase.getInstance().database.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
  if (!user?.isAdmin) {
    res.status(403).json({ success: false, message: 'Admins only' });
    return false;
  }
  return true;
}

async function relay(res: Response, path: string, body: unknown) {
  try {
    const out = await gatewayAdmin(path, body);
    return res.status(out.ok ? 200 : out.status).json({ success: out.ok, message: out.ok ? 'Done' : out.data?.error ?? 'The chat gateway refused the request', payload: out.data });
  } catch {
    return res.status(502).json({ success: false, message: 'The chat gateway is not reachable' });
  }
}

/** Reports waiting for a look, and who is muted. */
realtimeRouter.get('/mod/reports', async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  return relay(res, '/admin/reports', {});
});

/** Body: { uid, minutes, purge? } - silence a player (and remove their lines). */
realtimeRouter.post('/mod/mute', async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { uid, minutes, purge } = (req.body ?? {}) as { uid?: unknown; minutes?: unknown; purge?: unknown };
  if (typeof uid !== 'string' || typeof minutes !== 'number') {
    return res.status(400).json({ success: false, message: 'Send uid and minutes' });
  }
  return relay(res, '/admin/mute', { uid, minutes, purge: purge === true });
});

realtimeRouter.post('/mod/unmute', async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { uid } = (req.body ?? {}) as { uid?: unknown };
  if (typeof uid !== 'string') return res.status(400).json({ success: false, message: 'Send uid' });
  return relay(res, '/admin/unmute', { uid });
});
