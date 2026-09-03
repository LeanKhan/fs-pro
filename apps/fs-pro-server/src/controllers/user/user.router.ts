/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// Login, Signup & Logout

import { Router } from 'express';
import {
  createUser,
  getUserById,
  getUserByUsername,
  updateUserFields,
} from './user.service';
import { getClubs, updateClubFields } from '../clubs/club.service';
import { ClubInterface } from '../clubs/club.model';
import respond from '../../helpers/responseHandler';
import { IUserLogin } from '../../interfaces/Response';
import {
  initializeSession,
  initializeSessionForLogin,
  findSession,
} from '../../middleware/user';
import { updateClubs } from '../../controllers/clubs/club.controller';
import { IUser } from './user.model';
import { store } from '../../sessionStore';
import { comparePassword, resolveUserSession } from '../../utils/auth';
import log from '../../helpers/logger';

//
const router = Router();

//

/**
 * The minimum data needed is:
 *
 * {
 *  data: {
 *    FirstName: string,
 *    LastName: string,
 *    Username: string,
 *    Password: string
 *   }
 * }
 *
 * Registration chains into `updateClubs` (Club-coupled - a new user's id
 * is written into the club's `User` FK), which is fully repository-backed
 * now, so `createUser` is too - `req.body.clubs` reads whatever `Clubs`
 * comes back from the repository, `undefined` on Postgres (the array
 * doesn't exist there) same as a fresh Mongo user's always-empty one; a
 * registration payload never actually includes `Clubs` (see the shape
 * above), so `updateClubs`'s `Promise.all([])` is a no-op either way.
 */
router.post(
  '/join',
  async (req, res, next) => {
    try {
      const user: any = await createUser(req.body.data);
      req.body.userID = user._id;
      req.body.clubs = user.Clubs ?? [];
      next();
    } catch (error: any) {
      if (error.code === 11000 || error?.cause?.code === '23505') {
        respond.fail(res, 400, 'Username already exists!', error);
      } else {
        respond.fail(res, 400, 'Error creating user', error);
      }
    }
  },
  updateClubs,
  initializeSession
);

/** Login User */
router.post(
  '/login',
  (req, res, next) => {
    const { Username, Password }: IUserLogin = req.body.data;

    getUserByUsername(Username)
      .then((result) => {
        if (!result) {
          return respond.fail(res, 404, 'Username does not exist');
        }

        comparePassword(Password, result.Password)
          .then((isMatch) => {
            if (isMatch) {
              req.body.userID = result._id;
              next();
            } else {
              respond.fail(res, 400, 'Password is incorrect!', {
                errorCode: 1,
              });
            }
          })
          .catch((error: any) => {
            respond.fail(res, 400, 'Error logging in', error);
          });
      })
      .catch((error: any) => {
        return respond.fail(res, 400, 'Error logging in', error);
      });
  },
  initializeSessionForLogin
);

/** Change User's password */
router.post('/change-password', (req, res) => {
  const { Username, NewPassword } = req.body;

  getUserByUsername(Username)
    .then((result) => {
      if (!result) {
        return respond.fail(res, 404, 'Username does not exist');
      }

      updateUserFields(
        result._id as unknown as string,
        { Password: NewPassword } as Partial<IUser>
      )
        .then((user) => {
          return respond.success(
            res,
            200,
            'Password changed successfully',
            user
          );
        })
        .catch((error: any) => {
          return respond.fail(res, 400, 'Error changing password', error);
        });
    })
    .catch((error: any) => {
      return respond.fail(res, 400, 'Error changing password', error);
    });
});

/** Get User by id */
router.get('/:id', (req, res) => {
  const id = req.params.id;
  const populate = req.query.populate === 'true' ? true : false;

  // Club ownership is `Clubs.User` (a reverse FK) on both backends now -
  // `Users.Clubs` doesn't exist on Postgres - so `populate=true` derives
  // the owned-clubs list via a reverse lookup through the Club repository
  // instead of an array populate.
  const response = populate
    ? Promise.all([getUserById(id), getClubs({ UserId: id })]).then(
        ([user, clubs]) => (user ? { ...user, Clubs: clubs } : user)
      )
    : getUserById(id);

  response
    .then((user: any) => {
      respond.success(res, 200, 'User fetched successfully', user);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching User', err);
    });
});

/** Logout User */
router.delete('/:id/logout', (req, res) => {
  // delete user's session
  const userID = req.params.id;
  console.log(`User ID => ${userID}`);

  getUserById(userID)
    .then((user) => {
      if (!user) {
        return respond.fail(res, 404, 'Username does not exist');
      }

      resolveUserSession(
        user.Session,
        user.Session,
        function (err: any, sess: any) {
          if (sess) {
            // If you find the session it means it's an old one so do this...
            // set a new one, create a new cookie and send session data to client
            store.destroy(user.Session, (destroyErr: any) => {
              if (destroyErr) {
                throw new Error('Error in destroying Session');
              } else {
                return respond.success(
                  res,
                  200,
                  'Client logged out successfully'
                );
              }
            });
          } else {
            throw new Error('Session not found! Try reloading');
          }
        }
      );
    })
    .catch((error: any) => {
      return respond.fail(res, 400, 'Error logging out', error);
    });
});

/** Update User by id */
router.post('/:id/update', (req, res) => {
  const id = req.params.id;
  const { data } = req.body;

  const response = updateUserFields(id, data);

  response
    .then((user: any) => {
      respond.success(res, 200, 'User updated successfully', user);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error updating User', err);
    });
});

/**
 * Add Clubs to User account - claims ownership of each club by setting its
 * `User` FK, same write `POST /users/join`'s `updateClubs` does. Responds
 * with the user's full owned-clubs list (a reverse lookup, not a stored
 * array) rather than a User document - there's no `Users.Clubs` to return.
 */
router.post('/:id/add-clubs', (req, res) => {
  const id = req.params.id;
  const { data } = req.body;

  Promise.all(
    ((data ?? []) as string[]).map((clubId) =>
      updateClubFields(clubId, { UserId: id })
    )
  )
    .then(() => getClubs({ UserId: id }))
    .then((clubs) => {
      respond.success(res, 200, 'Clubs added successfully', clubs);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error adding Clubs', err);
    });
});

/** Add Club to User account - same reverse-FK write as above, for one club. */
router.post('/:id/add-club', (req, res) => {
  const id = req.params.id;
  const { clubId } = req.body.data;

  updateClubFields(clubId, { UserId: id })
    .then((club) => {
      respond.success(res, 200, 'Club added successfully', club);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error adding Club', err);
    });
});

/** Remove Club from User account - clears the club's `User` FK. */
router.delete('/:id/clubs/:club_id', (req, res) => {
  const club_id = req.params.club_id;

  updateClubFields(club_id, { User: null } as unknown as Partial<ClubInterface>)
    .then((club) => {
      respond.success(res, 200, 'User removed Club successfully', club);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error removing Club', err);
    });
});

/** Enter.. ??? [Need clarification] */
router.post('/enter', findSession);

export default router;
