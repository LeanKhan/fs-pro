import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import {
  buildAuthorizeUrl,
  exchangeCode,
  findOrCreateLocalUser,
  imaginationConfig,
  newPkcePair,
  verifyAccessToken,
} from '../../services/auth/imagination-auth.service';
import { getUserById, updateUserFields } from '../user/user.service';
import { getClubs } from '../clubs/club.service';
import type { IUser } from '../user/user.model';
import log from '../../helpers/logger';

/**
 * Login through imagination (see services/auth/imagination-auth.service.ts).
 *
 *   GET /api/auth/login      start: redirect to imagination's login/authorize
 *   GET /api/auth/callback   imagination sends the browser back with a code
 *   GET /api/auth/session    the signed-in user, shaped like the old login payload
 *   GET /api/auth/logout     end this session, then imagination's, then come back
 *
 * Login state (`state` + PKCE verifier) lives in the express session, so a
 * forged callback without the matching state is rejected.
 */
export const ssoRouter = Router();

/** Only same-app paths, never another site (open-redirect protection). */
function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/u';
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err: unknown) => (err ? reject(err) : resolve()));
  });
}

function sanitizeUser(user: IUser | null) {
  if (!user) return user;
  const { Password, Session, ...rest } = user as IUser & { Session?: string };
  return rest;
}

ssoRouter.get('/login', async (req: Request, res: Response) => {
  const config = imaginationConfig();
  if (!config) {
    return res.status(503).json({
      success: false,
      message: 'Imagination login is not configured (set IMAGINATION_CLIENT_SECRET).',
    });
  }

  const state = crypto.randomBytes(16).toString('base64url');
  const { verifier, challenge } = newPkcePair();
  (req.session as any).sso = { state, verifier, returnTo: safeReturnTo(req.query.returnTo) };
  await saveSession(req);
  return res.redirect(buildAuthorizeUrl(config, state, challenge));
});

ssoRouter.get('/callback', async (req: Request, res: Response) => {
  const config = imaginationConfig();
  if (!config) return res.status(503).send('Imagination login is not configured.');

  const pending = (req.session as any).sso as
    | { state: string; verifier: string; returnTo: string }
    | undefined;
  // One attempt per login: the pending state is consumed whatever happens next.
  delete (req.session as any).sso;

  const failBack = (reason: string) =>
    res.redirect(`${config.clientUrl}/auth/login?error=${encodeURIComponent(reason)}`);

  if (req.query.error) return failBack(String(req.query.error_description || req.query.error));
  if (!pending || typeof req.query.state !== 'string' || req.query.state !== pending.state) {
    return failBack('Login expired or was not started here - please try again.');
  }
  if (typeof req.query.code !== 'string') return failBack('No authorisation code was returned.');

  try {
    const accessToken = await exchangeCode(config, req.query.code, pending.verifier);
    const claims = await verifyAccessToken(config, accessToken);
    const user = await findOrCreateLocalUser(claims);

    (req.session as any).userID = user._id;
    await saveSession(req);
    await updateUserFields(user._id as string, { Session: req.sessionID } as Partial<IUser>);

    return res.redirect(`${config.clientUrl}/auth/complete?returnTo=${encodeURIComponent(pending.returnTo)}`);
  } catch (error) {
    log(`[sso] login failed: ${error instanceof Error ? error.message : String(error)}`);
    return failBack('Could not complete the login. Please try again.');
  }
});

ssoRouter.get('/session', async (req: Request, res: Response) => {
  const userID = (req.session as any)?.userID as string | undefined;
  const user = userID ? await getUserById(userID) : null;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not signed in' });
  }
  const clubs = await getClubs({ UserId: userID });
  return res.json({
    success: true,
    message: 'Session',
    payload: { ...sanitizeUser(user), Clubs: clubs.map((club: any) => club._id) },
  });
});

ssoRouter.get('/logout', (req: Request, res: Response) => {
  const config = imaginationConfig();
  const finish = () => {
    res.clearCookie('fspro.sid');
    // Then end the imagination session too, and return to the game's login page.
    return res.redirect(
      config
        ? `${config.webUrl}/logout?next=${encodeURIComponent(`${config.clientUrl}/auth/login`)}`
        : '/'
    );
  };
  req.session.destroy(() => finish());
});
