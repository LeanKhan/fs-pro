// packages/api-contract/src/routes/users.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { UserSchema } from '../schemas/user';
import { ClubSchema } from '../schemas/club';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const c = initContract();

// Writable subset of User - excludes populate-only Clubs and the
// never-sent-to-client Session. Password IS allowed here (matches the
// original's permissive `POST /:id/update` - the repository hashes it on
// write either way), but never comes back in a response.
const UserWriteSchema = UserSchema.omit({
  _id: true,
  Clubs: true,
  createdAt: true,
  updatedAt: true,
})
  .partial()
  .extend({ Password: z.string().optional() });

export const usersContract = c.router(
  {
    /** The minimum data needed is FullName/Username/Password. Registration
     * chains into claiming any Clubs the user picked during onboarding
     * (Clubs.User is a reverse FK, set per-club) and starting their
     * session. */
    joinUser: {
      method: 'POST',
      path: '/join',
      body: z.object({
        FullName: z.string(),
        Username: z.string(),
        Password: z.string(),
        /** Where the verification link and password resets go. */
        Email: z.string().trim().email('Enter a valid email address').max(254),
        Clubs: z.array(z.string()).optional(),
      }),
      responses: {
        200: successEnvelope(UserSchema),
        400: failEnvelope(),
      },
    },

    loginUser: {
      method: 'POST',
      path: '/login',
      body: z.object({
        Username: z.string(),
        Password: z.string(),
      }),
      responses: {
        200: successEnvelope(UserSchema),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Always answers 200, so it can't be used to learn which emails have
     * accounts. If one does, a reset link is emailed. */
    requestPasswordReset: {
      method: 'POST',
      path: '/forgot-password',
      body: z.object({ Email: z.string().trim().max(254) }),
      responses: { 200: successEnvelope(z.null().optional()), 400: failEnvelope() },
    },

    /** The emailed token plus the new password; ends every session of the account. */
    resetPassword: {
      method: 'POST',
      path: '/reset-password',
      body: z.object({ Token: z.string().max(200), NewPassword: z.string().min(8, 'Use at least 8 characters').max(200) }),
      responses: { 200: successEnvelope(z.null().optional()), 400: failEnvelope() },
    },

    verifyEmail: {
      method: 'POST',
      path: '/verify-email',
      body: z.object({ Token: z.string().max(200) }),
      responses: { 200: successEnvelope(z.null().optional()), 400: failEnvelope() },
    },

    /** Signed in: send the verification link again to the address on file. */
    resendVerification: {
      method: 'POST',
      path: '/resend-verification',
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(z.null().optional()),
        400: failEnvelope(),
        401: failEnvelope(),
      },
    },

    /** Signed in: add or change the account's email (password required);
     * a verification link goes to the new address. */
    setEmail: {
      method: 'POST',
      path: '/email',
      body: z.object({ Email: z.string().trim().email('Enter a valid email address').max(254), Password: z.string() }),
      responses: {
        200: successEnvelope(UserSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        409: failEnvelope(),
      },
    },

    changePassword: {
      method: 'POST',
      path: '/change-password',
      /** Signed-in users only, and only for themselves: the current
       * password must match. There is no reset-by-username. */
      body: z.object({
        Username: z.string(),
        CurrentPassword: z.string(),
        NewPassword: z.string().min(8, 'Use at least 8 characters'),
      }),
      responses: {
        200: successEnvelope(UserSchema),
        404: failEnvelope(),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
      },
    },

    /** Club ownership is Clubs.User (a reverse FK) on both backends -
     * Users.Clubs doesn't exist on Postgres - so `populate=true` derives
     * the owned-clubs list via a reverse lookup through the Club
     * repository instead of an array populate. */
    getUser: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        populate: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(UserSchema),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    logoutUser: {
      method: 'DELETE',
      path: '/:id/logout',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(z.object({})),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    updateUser: {
      method: 'POST',
      path: '/:id/update',
      pathParams: z.object({
        id: z.string(),
      }),
      body: UserWriteSchema,
      responses: {
        200: successEnvelope(UserSchema),
        400: failEnvelope(),
      },
    },

    /** Claims ownership of each Club by setting its User FK, same write
     * POST /users/join and POST /:id/add-club do. Responds with the user's
     * full owned-clubs list (a reverse lookup, not a stored array) rather
     * than a User document - there's no Users.Clubs to return. */
    addClubsToUser: {
      method: 'POST',
      path: '/:id/add-clubs',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.array(z.string()),
      responses: {
        200: successEnvelope(z.array(ClubSchema)),
        400: failEnvelope(),
      },
    },

    addClubToUser: {
      method: 'POST',
      path: '/:id/add-club',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.object({
        clubId: z.string(),
      }),
      responses: {
        200: successEnvelope(ClubSchema),
        400: failEnvelope(),
      },
    },

    /** Clears the Club's User FK. */
    removeClubFromUser: {
      method: 'DELETE',
      path: '/:id/clubs/:club_id',
      pathParams: z.object({
        id: z.string(),
        club_id: z.string(),
      }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(ClubSchema),
        400: failEnvelope(),
      },
    },

    /** Re-establish a session when the cookie wasn't sent back - finds the
     * user's existing session (if any) and re-issues it, or starts a new
     * one. */
    enterSession: {
      method: 'POST',
      path: '/enter',
      body: z.object({
        userID: z.string(),
        sessionID: z.string(),
      }),
      responses: {
        200: successEnvelope(
          z.object({ userID: z.string(), sessionID: z.string() })
        ),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/users', strictStatusCodes: true }
);
