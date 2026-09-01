import session from 'express-session';
import mStore from 'connect-mongodb-session';
import postgres from 'postgres';
import { resolveBackend } from './db/backendChoice';

/**
 * Extracted out of server.ts so controllers/user/* and middleware/user.ts
 * can use the session store without importing server.ts itself.
 *
 * That import used to be `import { store } from '../../server'`, which is a
 * circular dependency: db/mongodb.ts imports controllers/user/user.model.ts,
 * which imported server.ts, which imports the db layer. Harmless when
 * server.ts is the process entry point (Node just hands back its
 * still-in-progress exports when the cycle loops back to it), but a real bug
 * anywhere else it gets required first - e.g. a worker_thread whose entry
 * point is NOT server.ts ends up loading server.ts fresh from scratch
 * mid-cycle, which then re-enters the db layer while IT is still loading too.
 *
 * The backend/Mongo-url lookups below intentionally only import
 * `db/backendChoice.ts` (a leaf module - just `fs`/`path`, no app imports),
 * never `./db` itself or anything under it - `db/index.ts` and
 * `db/drizzle/index.ts` both pull in `db/mongodb.ts`, which is the actual
 * source of the cycle above, so importing either here would recreate it one
 * hop later.
 */
const backend = resolveBackend();

/**
 * Postgres-backed session store, used when `backend === 'drizzle'` so
 * sessions don't require a live Mongo connection at all under
 * `USE_DRIZZLE=true`. A small hand-rolled `session.Store` (not
 * `connect-pg-simple`) so this reuses the same `postgres` driver already in
 * package.json instead of adding `pg` as a second Postgres client, and
 * needs its own dedicated connection (not `DrizzleDatabase`'s) for the
 * circular-import reason above. Table is created by
 * `scripts/migration/setup-sessions-table.ts` - not part of `schema.ts`,
 * same reasoning as the counter sequences (see `utils/counter.ts`).
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

let store: session.Store;

if (backend === 'drizzle') {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required when USE_DRIZZLE=true');
  }

  store = new PgSessionStore(postgres(connectionString));
} else {
  const mongoUrl = process.env.DEV_TEST?.trim()
    ? (process.env.DEV_MONGO_URL?.trim() as string)
    : (process.env.PROD_MONGO_URL?.trim() as string);

  const MongoStore = mStore(session);

  store = new MongoStore(
    {
      uri: mongoUrl,
      collection: 'Sessions',
    },
    (err: any) => {
      if (err) {
        console.error(`Error connecting Store to MongoDB => ${err}`);
      }
    }
  );
}

export { store };
