import session from 'express-session';
import postgres from 'postgres';

/**
 * Extracted out of server.ts so controllers/user/* and middleware/user.ts
 * can use the session store without importing server.ts itself.
 *
 * Postgres-backed session store - a small hand-rolled `session.Store` (not
 * `connect-pg-simple`) so this reuses the same `postgres` driver already in
 * package.json instead of adding `pg` as a second Postgres client. It needs
 * its own dedicated connection (not `DrizzleDatabase`'s) since this module
 * is loaded very early (before `server.ts`'s own imports settle). Table is
 * created by `scripts/migration/setup-sessions-table.ts` - not part of
 * `schema.ts`, same reasoning as the counter sequences (see
 * `utils/counter.ts`).
 */
class PgSessionStore extends session.Store {
  constructor(private sql: postgres.Sql) {
    super();
  }

  get(
    sid: string,
    callback: (err: any, session?: session.SessionData | null) => void
  ): void {
    this.sql<{ session: session.SessionData }[]>`
      SELECT session FROM "Sessions" WHERE sid = ${sid} AND expires > now()
    `
      .then((rows) => callback(null, rows[0]?.session ?? null))
      .catch((err) => callback(err));
  }

  set(
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: any) => void
  ): void {
    const maxAge = sessionData.cookie?.maxAge ?? 60000 * 60 * 24;
    const expires = new Date(Date.now() + maxAge);

    this.sql`
      INSERT INTO "Sessions" (sid, session, expires)
      VALUES (${sid}, ${this.sql.json(sessionData as any)}, ${expires})
      ON CONFLICT (sid) DO UPDATE SET session = EXCLUDED.session, expires = EXCLUDED.expires
    `
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    this.sql`DELETE FROM "Sessions" WHERE sid = ${sid}`
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  touch(
    sid: string,
    sessionData: session.SessionData,
    callback?: (err?: any) => void
  ): void {
    const maxAge = sessionData.cookie?.maxAge ?? 60000 * 60 * 24;
    const expires = new Date(Date.now() + maxAge);

    this.sql`UPDATE "Sessions" SET expires = ${expires} WHERE sid = ${sid}`
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const store: session.Store = new PgSessionStore(postgres(connectionString));

export { store };
