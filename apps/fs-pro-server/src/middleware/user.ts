import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getUserById, updateUserFields } from '../controllers/user/user.service';
import { getClubs } from '../controllers/clubs/club.service';
import responseHandler from '../helpers/responseHandler';
import { store } from '../sessionStore';
import { IUser } from '../controllers/user/user.model';
import { resolveUserSession } from '../utils/auth';
import log from '../helpers/logger';

/**
 * Used only by POST /join, right after registration. Repository-backed now
 * that Club (registration's one real coupling, via `updateClubs`) is fully
 * converted too - see `initializeSessionForLogin` below for the equivalent
 * login-path stamping, and its doc comment for why `Clubs` needs a live
 * reverse lookup rather than the stored field on this path too, in
 * principle - not done here since a freshly-registered user has no clubs
 * yet regardless of backend.
 */
export function initializeSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = req.body.userID;
  (req.session as any).userID = id;

  req.session!.save((err: any) => {
    if (err) {
      responseHandler.fail(res, 400, 'Error creating session', err);
    } else {
      // User has been crreated

      updateUserFields(id, { Session: req.sessionID } as Partial<IUser>)
        .then((user: any) => {
          responseHandler.success(res, 200, 'User authenticated successfully', {
            ...user,
          });
        })
        .catch((error: any) => {
          responseHandler.fail(res, 400, 'Error fetching User', error);
        });
    }
  });
}

/**
 * Used by POST /login. The user was fetched via the repository (see
 * user.router.ts), so its `_id` may be a Postgres UUID - stamping the
 * session through the same repository (`updateUserFields`) instead of a
 * raw `DB.Models.User` call keeps this correct on either backend.
 *
 * `Clubs` in the response is overwritten with a live `Clubs.User` reverse
 * lookup rather than whatever the stored `Users.Clubs` array says (on
 * Postgres that array doesn't even exist - dropped from the schema - so
 * `user.Clubs` there would otherwise just be `undefined`). This is the
 * client's actual source of truth for club ownership on login
 * (`login.vue` stores it as `user.value.clubs`) - now that
 * `/add-club(s)`/`/clubs/:club_id` write ownership straight to `Clubs.User`
 * and no longer touch the array at all, leaving this on the raw field would
 * make it silently go stale the first time a user added or removed a club.
 * Kept as an id array (not full Club objects) to match what
 * `settings.vue`'s `_id: { $in: user.value.clubs }` query still expects.
 */
export function initializeSessionForLogin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = req.body.userID;
  (req.session as any).userID = id;

  req.session!.save((err: any) => {
    if (err) {
      return responseHandler.fail(res, 400, 'Error creating session', err);
    }

    Promise.all([
      updateUserFields(id, { Session: req.sessionID } as Partial<IUser>),
      getClubs({ User: id }),
    ])
      .then(([user, clubs]) => {
        responseHandler.success(res, 200, 'User authenticated successfully', {
          ...user,
          Clubs: clubs.map((club) => club._id),
        });
      })
      .catch((error: any) => {
        responseHandler.fail(res, 400, 'Error fetching User', error);
      });
  });
}

/**
 * checkSession
 *
 * Check if session exists...
 *
 * @param req
 * @param res
 * @param next
 */
export const checkSession: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.session!.socketID) {
    const sessionID = req.sessionID as string;

    store.get(sessionID, (err: any, session: any) => {
      if (session) {
        return responseHandler.success(res, 200, 'Authenticated successfully', {
          sessionExists: true,
          user: { userID: (req.session as any).userID, sessionID },
        });
      } else {
        //  if session is expired or something, go to the next middleware...
        //  the next one checks if the client sent any session object

        return next();
      }
    });
  } else {
    //   If the request does not have any session object attached move to next middleware...
    return next();
  }
};

export function findSession(req: Request, res: Response, next: NextFunction) {
  const { userID, sessionID } = req.body.user;

  // This is if the cookie was not sent back, if not find the session and create a new one with the same data...

  getUserById(userID)
    .then((user) => {
      if (!user) {
        return responseHandler.fail(res, 404, 'User not found');
      }

      // here find an accompanying session... (matches the original
      // `user.findSession(user.Session, cb)` call exactly - always looks
      // the session up under the user's own stored Session value, not the
      // incoming request's sessionID)
      resolveUserSession(user.Session, user.Session, (err: any, sess: any) => {
        if (sess) {
          // If you find the session it means it's an old one so do this...
          // set a new one, create a new cookie and send session data to client
          store.set(sessionID, sess, (err: any) => {
            if (err) {
              throw new Error('Error in setting Session' + `${err}`);
            }

            updateUserFields(userID, { Session: req.sessionID } as Partial<IUser>)
              .then(() => {
                return responseHandler.success(
                  res,
                  200,
                  'Client Authenticated successfully',
                  { userID: user._id, sessionID: req.sessionID }
                );
              })
              .catch((updateErr: any) => {
                responseHandler.fail(res, 400, 'Error in authentication', updateErr);
              });
          });
        } else {
          // User exists but does not have any associated sessions...
          (req.session as any).userID = user._id;

          req.session!.save((sessionErr: any) => {
            if (sessionErr) {
              throw new Error('Error in saving new user session' + `${sessionErr}`);
            }

            updateUserFields(userID, { Session: req.sessionID } as Partial<IUser>)
              .then(() => {
                return responseHandler.success(
                  res,
                  200,
                  'Client Authenticated successfully',
                  { userID: user._id, sessionID: req.sessionID }
                );
              })
              .catch((updateErr: any) => {
                responseHandler.fail(res, 400, 'Error in authentication', updateErr);
              });
          });
        }
      });
    })
    .catch((err: any) => {
      log(`error in entering => ${err}`);
      responseHandler.fail(res, 400, 'Error in authentication', err);
    });
}
