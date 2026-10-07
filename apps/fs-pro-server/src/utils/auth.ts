import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { store } from '../sessionStore';
import { DrizzleDatabase } from '../db/drizzle';

let dummy: Promise<string> | undefined;
/** A real bcrypt hash nobody's password matches: comparing against it costs the same as a genuine check. */
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(`dummy-${Math.random()}`));
}

/** Signs the user out everywhere (after a password reset). */
export async function revokeSessions(userId: string): Promise<void> {
  await DrizzleDatabase.getInstance().database.execute(sql`DELETE FROM "Sessions" WHERE session->>'userID' = ${userId}`);
}

/**
 * Standalone replacements for the two `UserSchema.methods` in
 * `controllers/user/user.model.ts` (`comparePassword`, `findSession`),
 * which only work on a live, non-`.lean()`d Mongoose Document. A repository
 * returning plain objects (Drizzle rows are always plain; the Mongo repo
 * uses `.lean()` too, to avoid leaking Mongoose internals over the API -
 * see the Place repository fix earlier this session) needs the underlying
 * logic available as plain functions instead.
 */

/** Same cost factor (10) as `UserSchema.pre('save')`'s hash hook. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Same logic as today's `UserSchema.methods.findSession`, just taking the
 * user's `Session` value as a plain argument instead of reading `this`.
 */
export function resolveUserSession(
  currentSession: string | undefined,
  incomingSessionId: string,
  cb: (err: any, sess: any) => void
): void {
  store.get(incomingSessionId, (err: any, sess: any) => {
    if (!err && currentSession === incomingSessionId) {
      return cb(null, sess);
    } else if (currentSession !== incomingSessionId) {
      return cb(null, currentSession);
    } else {
      throw err;
    }
  });
}
