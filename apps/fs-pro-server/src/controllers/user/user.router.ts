import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type { User as ContractUser, Club as ContractClub } from '@repo/api-contract';

import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  updateUserFields,
} from './user.service';
import { consumeToken, issueToken } from '../../services/auth/email-token.service';
import { resetMail, sendMail, verificationMail } from '../../services/mail/mail.service';
import { getClubs, updateClubFields } from '../clubs/club.service';
import type { ClubInterface } from '../clubs/club.model';
import { IUser } from './user.model';
import { store } from '../../sessionStore';
import { comparePassword, dummyHash, resolveUserSession, revokeSessions } from '../../utils/auth';
import log from '../../helpers/logger';

const s = initServer();

/** Password login/registration here is superseded by imagination login; set
 * LEGACY_LOGIN_ENABLED=false to turn it off once users have been migrated. */
function legacyLoginDisabled() {
  return process.env.LEGACY_LOGIN_ENABLED?.trim().toLowerCase() === 'false';
}

const LEGACY_LOGIN_OFF = {
  status: 403 as const,
  body: {
    success: false as const,
    message: 'Password login is disabled - sign in through imagination.',
  },
};

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Never let Password/Session cross the wire, on any route. Email goes only
 * to routes that return the caller's own account; the verified flag replaces
 * the raw timestamp. */
function sanitizeUser(user: any): any {
  if (!user) return user;
  const { Password, Session, EmailVerifiedAt, ...rest } = user;
  return { ...rest, EmailVerified: !!EmailVerifiedAt };
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const looksLikeEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Emails the verification link; a failure to send never fails the request. */
async function sendVerification(user: { _id?: string; FullName: string; Email?: string | null }) {
  if (!user._id || !user.Email) return;
  const token = await issueToken(user._id, 'verify');
  await sendMail(verificationMail(user.Email, user.FullName, token));
}

const BAD_LOGIN = {
  status: 400 as const,
  // One message for an unknown username and a wrong password, so the form
  // can't be used to find out who has an account.
  body: { success: false as const, message: 'Username or password is incorrect', payload: { errorCode: 1 } },
};

function saveSession(req: { session?: any }): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session!.save((err: any) => (err ? reject(err) : resolve()));
  });
}

export const userTsRestRoutes = s.router(contract.users, {
  /** FullName/Username/Password; the new manager then founds a club
   * (client /start). */
  joinUser: async ({ body, req }) => {
    if (legacyLoginDisabled()) return LEGACY_LOGIN_OFF as any;
    const problem = !/^[A-Za-z0-9_.-]{3,24}$/.test(body.Username ?? '')
      ? 'Usernames are 3-24 letters, numbers, dots, dashes or underscores'
      : (body.Password ?? '').length < 8
        ? 'Use a password of at least 8 characters'
        : !(body.FullName ?? '').trim()
          ? 'Tell us your name'
          : !looksLikeEmail(normalizeEmail(body.Email ?? ''))
            ? 'Enter a valid email address'
            : null;
    if (problem) return { status: 400, body: { success: false, message: problem } };
    try {
      const user: any = await createUser({
        FullName: body.FullName,
        Username: body.Username,
        Password: body.Password,
        Email: normalizeEmail(body.Email),
      } as Partial<IUser>);
      sendVerification(user).catch((err) => console.error('[mail] verification email failed:', err));

      // New managers found their own club (POST /atlas/clubs); signing up
      // never hands over an existing club, so `body.Clubs` is ignored.

      (req.session as any).userID = user._id;
      await saveSession(req);

      const authenticated = await updateUserFields(user._id, {
        Session: req.sessionID,
      } as Partial<IUser>);

      return {
        status: 200,
        body: {
          success: true,
          message: 'User authenticated successfully',
          payload: sanitizeUser(authenticated) as ContractUser,
        },
      };
    } catch (err: any) {
      if (err.code === 11000 || err?.cause?.code === '23505') {
        const emailClash = /email/i.test(String(err?.cause?.constraint_name ?? err?.cause?.detail ?? ''));
        return {
          status: 400,
          body: {
            success: false,
            message: emailClash ? 'That email is already used by another account' : 'Username already exists!',
            payload: fail(err),
          },
        };
      }
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error creating user',
          payload: fail(err),
        },
      };
    }
  },

  /** `Clubs` in the response is a live `Clubs.User` reverse lookup (ids
   * only, matching what `settings.vue` expects), not the stored
   * `Users.Clubs` array - see the schema doc comment for why. */
  loginUser: async ({ body, req }) => {
    if (legacyLoginDisabled()) return LEGACY_LOGIN_OFF as any;
    try {
      const result: any = await getUserByUsername(body.Username);
      if (!result) {
        // Same work as a real check, so the response time doesn't give it away.
        await comparePassword(body.Password, await dummyHash());
        return BAD_LOGIN;
      }

      const isMatch = await comparePassword(body.Password, result.Password);
      if (!isMatch) return BAD_LOGIN;

      (req.session as any).userID = result._id;
      await saveSession(req);

      const [user, clubs] = await Promise.all([
        updateUserFields(result._id, {
          Session: req.sessionID,
        } as Partial<IUser>),
        getClubs({ UserId: result._id }),
      ]);

      return {
        status: 200,
        body: {
          success: true,
          message: 'User authenticated successfully',
          payload: {
            ...sanitizeUser(user),
            Clubs: clubs.map((club: any) => club._id),
          } as ContractUser,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: { success: false, message: 'Error logging in', payload: fail(err) },
      };
    }
  },

  /** Repository hashes `NewPassword` on write, same as every other user
   * update - no manual hashing here. */
  changePassword: async ({ body, req }) => {
    if (legacyLoginDisabled()) return LEGACY_LOGIN_OFF as any;
    try {
      const sessionUserId = (req.session as { userID?: string } | undefined)?.userID;
      if (!sessionUserId) {
        return { status: 401, body: { success: false, message: 'Sign in to change your password' } };
      }
      const result = await getUserByUsername(body.Username);
      if (!result) {
        return {
          status: 404,
          body: { success: false, message: 'Username does not exist' },
        };
      }
      if (String(result._id) !== sessionUserId) {
        return { status: 403, body: { success: false, message: 'You can only change your own password' } };
      }
      if (!(await comparePassword(body.CurrentPassword, result.Password))) {
        return { status: 400, body: { success: false, message: 'Current password is incorrect' } };
      }

      const user = await updateUserFields(result._id as string, {
        Password: body.NewPassword,
      } as Partial<IUser>);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Password changed successfully',
          payload: sanitizeUser(user) as ContractUser,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error changing password',
          payload: fail(err),
        },
      };
    }
  },

  requestPasswordReset: async ({ body }) => {
    const email = normalizeEmail(body.Email ?? '');
    if (looksLikeEmail(email)) {
      // Not awaited and always answered the same, so neither the response
      // nor its timing says whether the address has an account.
      (async () => {
        const user = await getUserByEmail(email);
        if (!user?._id) return;
        const token = await issueToken(String(user._id), 'reset');
        await sendMail(resetMail(email, user.FullName, token));
      })().catch((err) => console.error('[mail] password reset failed:', err));
    }
    return {
      status: 200,
      body: { success: true, message: 'If that email belongs to an account, we have sent a link to reset the password.' },
    } as any;
  },

  resetPassword: async ({ body }) => {
    try {
      const userId = await consumeToken(body.Token, 'reset');
      if (!userId) {
        return { status: 400, body: { success: false, message: 'This link has expired or was already used. Ask for a new one.' } };
      }
      // The password change is the proof they own the mailbox too.
      await updateUserFields(userId, { Password: body.NewPassword, EmailVerifiedAt: new Date() } as Partial<IUser>);
      await revokeSessions(userId);
      return { status: 200, body: { success: true, message: 'Password changed. Sign in with the new one.' } } as any;
    } catch (err) {
      return { status: 400, body: { success: false, message: 'Could not reset the password', payload: fail(err) } };
    }
  },

  verifyEmail: async ({ body }) => {
    try {
      const userId = await consumeToken(body.Token, 'verify');
      if (!userId) {
        return { status: 400, body: { success: false, message: 'This link has expired or was already used. Sign in and ask for a new one.' } };
      }
      await updateUserFields(userId, { EmailVerifiedAt: new Date() } as Partial<IUser>);
      return { status: 200, body: { success: true, message: 'Email confirmed. Thank you!' } } as any;
    } catch (err) {
      return { status: 400, body: { success: false, message: 'Could not confirm the email', payload: fail(err) } };
    }
  },

  resendVerification: async ({ req }) => {
    const userId = (req.session as { userID?: string } | undefined)?.userID;
    if (!userId) return { status: 401, body: { success: false, message: 'Sign in first' } };
    const user: any = await getUserById(userId);
    if (!user?.Email) return { status: 400, body: { success: false, message: 'Add an email address first' } };
    if (user.EmailVerifiedAt) return { status: 400, body: { success: false, message: 'Your email is already confirmed' } };
    sendVerification(user).catch((err) => console.error('[mail] verification email failed:', err));
    return { status: 200, body: { success: true, message: `We sent a new link to ${user.Email}.` } } as any;
  },

  setEmail: async ({ body, req }) => {
    const userId = (req.session as { userID?: string } | undefined)?.userID;
    if (!userId) return { status: 401, body: { success: false, message: 'Sign in first' } };
    const email = normalizeEmail(body.Email);
    if (!looksLikeEmail(email)) return { status: 400, body: { success: false, message: 'Enter a valid email address' } };
    const user: any = await getUserById(userId);
    if (!user) return { status: 401, body: { success: false, message: 'Sign in first' } };
    // Whoever holds a session must not be able to point recovery at their own inbox.
    if (!(await comparePassword(body.Password, user.Password))) {
      return { status: 400, body: { success: false, message: 'Password is incorrect' } };
    }
    const taken = await getUserByEmail(email);
    if (taken && String(taken._id) !== userId) {
      return { status: 409, body: { success: false, message: 'That email is already used by another account' } };
    }
    if (user.Email?.toLowerCase() === email && user.EmailVerifiedAt) {
      return { status: 200, body: { success: true, message: 'Email already confirmed', payload: sanitizeUser(user) as ContractUser } };
    }
    try {
      const updated: any = await updateUserFields(userId, { Email: email, EmailVerifiedAt: null } as Partial<IUser>);
      sendVerification(updated).catch((err) => console.error('[mail] verification email failed:', err));
      return { status: 200, body: { success: true, message: `We sent a link to ${email}.`, payload: sanitizeUser(updated) as ContractUser } };
    } catch (err: any) {
      if (err?.cause?.code === '23505') {
        return { status: 409, body: { success: false, message: 'That email is already used by another account' } };
      }
      return { status: 400, body: { success: false, message: 'Could not save the email', payload: fail(err) } };
    }
  },

  /** Club ownership is `Clubs.User` (a reverse FK) on both backends -
   * `Users.Clubs` doesn't exist on Postgres - so `populate=true` derives
   * the owned-clubs list via a reverse lookup through the Club repository
   * instead of an array populate. */
  getUser: async ({ params, query }) => {
    try {
      const populate = query.populate === 'true';

      const user: any = populate
        ? await Promise.all([
            getUserById(params.id),
            getClubs({ UserId: params.id }),
          ]).then(([u, clubs]) => (u ? { ...u, Clubs: clubs } : u))
        : await getUserById(params.id);

      if (!user) {
        return {
          status: 404,
          body: { success: false, message: 'User not found' },
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          message: 'User fetched successfully',
          payload: sanitizeUser(user) as ContractUser,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching User',
          payload: fail(err),
        },
      };
    }
  },

  logoutUser: async ({ params }) => {
    try {
      const user: any = await getUserById(params.id);
      if (!user) {
        return {
          status: 404,
          body: { success: false, message: 'Username does not exist' },
        };
      }

      const sess = await new Promise<any>((resolve, reject) => {
        resolveUserSession(user.Session, user.Session, (err: any, s: any) =>
          err ? reject(err) : resolve(s)
        );
      });

      if (!sess) {
        throw new Error('Session not found! Try reloading');
      }

      await new Promise<void>((resolve, reject) => {
        store.destroy(user.Session, (destroyErr: any) =>
          destroyErr
            ? reject(new Error('Error in destroying Session'))
            : resolve()
        );
      });

      return {
        status: 200,
        body: { success: true, message: 'Client logged out successfully', payload: {} },
      };
    } catch (err) {
      return {
        status: 400,
        body: { success: false, message: 'Error logging out', payload: fail(err) },
      };
    }
  },

  updateUser: async ({ params, body }) => {
    try {
      const user = await updateUserFields(params.id, body as Partial<IUser>);
      return {
        status: 200,
        body: {
          success: true,
          message: 'User updated successfully',
          payload: sanitizeUser(user) as ContractUser,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error updating User',
          payload: fail(err),
        },
      };
    }
  },

  /** Claims ownership of each Club by setting its `User` FK, same write
   * `POST /join`/`POST /:id/add-club` do. Responds with the user's full
   * owned-clubs list (a reverse lookup, not a stored array) rather than a
   * User document - there's no `Users.Clubs` to return. */
  addClubsToUser: async ({ params, body }) => {
    try {
      await Promise.all(
        body.map((clubId) => updateClubFields(clubId, { UserId: params.id }))
      );
      const clubs = await getClubs({ UserId: params.id });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Clubs added successfully',
          payload: clubs as unknown as ContractClub[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: { success: false, message: 'Error adding Clubs', payload: fail(err) },
      };
    }
  },

  addClubToUser: async ({ params, body }) => {
    try {
      const club = await updateClubFields(body.clubId, { UserId: params.id });
      return {
        status: 200,
        body: {
          success: true,
          message: 'Club added successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: { success: false, message: 'Error adding Club', payload: fail(err) },
      };
    }
  },

  /** Clears the Club's `User` FK. The old handler wrote `{ User: null }`,
   * which isn't a real `ClubInterface` field (it's `UserId`) - a no-op
   * write that left ownership dangling and made "remove club from
   * account" silently do nothing. */
  removeClubFromUser: async ({ params }) => {
    try {
      const club = await updateClubFields(params.club_id, {
        UserId: null,
      } as unknown as Partial<ClubInterface>);

      return {
        status: 200,
        body: {
          success: true,
          message: 'User removed Club successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: { success: false, message: 'Error removing Club', payload: fail(err) },
      };
    }
  },

  /** Re-establish a session when the cookie wasn't sent back. Note: the
   * `sessionID` used to `store.set` (the client's own, freshly-generated
   * one) and the `req.sessionID` then persisted onto the User row (this
   * request's own express-session-assigned id) are not the same value in
   * the sess-found branch - a pre-existing quirk, ported as-is rather than
   * "fixed", since it's unclear which id is actually meant to win. */
  enterSession: async ({ body, req }) => {
    try {
      const { userID, sessionID } = body;

      const user: any = await getUserById(userID);
      if (!user) {
        return { status: 404, body: { success: false, message: 'User not found' } };
      }

      const sess = await new Promise<any>((resolve, reject) => {
        resolveUserSession(user.Session, user.Session, (err: any, s: any) =>
          err ? reject(err) : resolve(s)
        );
      });

      if (sess) {
        await new Promise<void>((resolve, reject) => {
          store.set(sessionID, sess, (err: any) =>
            err
              ? reject(new Error('Error in setting Session' + `${err}`))
              : resolve()
          );
        });
      } else {
        (req.session as any).userID = user._id;
        await saveSession(req);
      }

      await updateUserFields(userID, {
        Session: req.sessionID,
      } as Partial<IUser>);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Client Authenticated successfully',
          payload: { userID: user._id as string, sessionID: req.sessionID },
        },
      };
    } catch (err) {
      log(`error in entering => ${fail(err)}`);
      return {
        status: 400,
        body: { success: false, message: 'Error in authentication', payload: fail(err) },
      };
    }
  },
});
