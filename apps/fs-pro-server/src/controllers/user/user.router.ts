import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type { User as ContractUser, Club as ContractClub } from '@repo/api-contract';

import {
  createUser,
  getUserById,
  getUserByUsername,
  updateUserFields,
} from './user.service';
import { getClubs, updateClubFields } from '../clubs/club.service';
import type { ClubInterface } from '../clubs/club.model';
import { IUser } from './user.model';
import { store } from '../../sessionStore';
import { comparePassword, resolveUserSession } from '../../utils/auth';
import log from '../../helpers/logger';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Never let Password/Session cross the wire, on any route. */
function sanitizeUser(user: any): any {
  if (!user) return user;
  const { Password, Session, ...rest } = user;
  return rest;
}

function saveSession(req: { session?: any }): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session!.save((err: any) => (err ? reject(err) : resolve()));
  });
}

export const userTsRestRoutes = s.router(contract.users, {
  /**
   * The minimum data needed is FullName/Username/Password. Registration
   * chains into claiming any Clubs the user picked during onboarding
   * (`Clubs.User` is a reverse FK, set per-club) using the client's own
   * `Clubs` selection - the old Express chain read `user.Clubs` off the
   * just-created record instead, which is always empty (Postgres doesn't
   * even have a `Users.Clubs` column), silently breaking "pick your club at
   * signup".
   */
  joinUser: async ({ body, req }) => {
    try {
      const user: any = await createUser({
        FullName: body.FullName,
        Username: body.Username,
        Password: body.Password,
      } as Partial<IUser>);

      await Promise.all(
        (body.Clubs ?? []).map((clubId) =>
          updateClubFields(clubId, { UserId: user._id })
        )
      );

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
        return {
          status: 400,
          body: {
            success: false,
            message: 'Username already exists!',
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
    try {
      const result: any = await getUserByUsername(body.Username);
      if (!result) {
        return {
          status: 404,
          body: { success: false, message: 'Username does not exist' },
        };
      }

      const isMatch = await comparePassword(body.Password, result.Password);
      if (!isMatch) {
        return {
          status: 400,
          body: {
            success: false,
            message: 'Password is incorrect!',
            payload: { errorCode: 1 },
          },
        };
      }

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
  changePassword: async ({ body }) => {
    try {
      const result = await getUserByUsername(body.Username);
      if (!result) {
        return {
          status: 404,
          body: { success: false, message: 'Username does not exist' },
        };
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
