/**
 * Database abstraction layer.
 * Supports MongoDB and PostgreSQL through Prisma or Drizzle.
 *
 * Set USE_POSTGRESQL=true in .env to use PostgreSQL.
 * Set USE_DRIZZLE=true with USE_POSTGRESQL=true to use Drizzle.
 * Otherwise, defaults to MongoDB.
 *
 * The backend can also be set for testing via `POST /api/meta/db/backend`
 * (see controllers/meta/meta.router.ts and db/backendChoice.ts), which
 * persists a choice to a small state file that `resolveBackend()` below
 * checks before falling back to the env vars above - but you still have to
 * restart the process yourself for it to take effect. Two automatic
 * alternatives were tried and reverted:
 *   - Hot-swapping the backend inside one running process: broke on the
 *     second `MongoDatabase` construction, because Mongoose's model
 *     registry is global (not scoped to any one `MongoDatabase` instance)
 *     and most model classes have no guard against registering the same
 *     model name twice (`OverwriteModelError`).
 *   - Self-triggering a restart via `process.exit()`: doesn't reliably come
 *     back up - `ts-node-dev --respawn` only respawns on a *file-change*
 *     event, not a plain process exit, and behavior would be even less
 *     predictable under nodemon/PM2/plain `node`.
 * A manual restart is the one option that behaves identically everywhere:
 * every model and connection rebuilds from scratch in a fresh process,
 * identical to normal single-backend startup.
 */
import { connection } from 'mongoose';
import { DatabaseType, IDatabase, IModels } from './interfaces';
import { DrizzleDatabase } from './drizzle';
import { MongoDatabase } from './mongodb';
import { PostgreSQLDatabase } from './postgresql';
import { getMongoUrl } from './mongoUrl';
import { resolveBackend, BackendChoice } from './backendChoice';

export const MONGO_URL = getMongoUrl();

export default class DB {
  private static instance: IDatabase;
  private static readonly _backend: BackendChoice = resolveBackend();

  public static async start(): Promise<void> {
    if (!DB.instance) {
      console.log(`Using ${DB._backend} database backend`);

      switch (DB._backend) {
        case 'drizzle':
          DB.instance = DrizzleDatabase.getInstance();
          break;
        case 'prisma':
          DB.instance = PostgreSQLDatabase.getInstance();
          break;
        case 'mongo':
        default:
          DB.instance = MongoDatabase.getInstance(MONGO_URL);
      }

      // Previously not awaited here, so `await DB.start()` anywhere else
      // didn't actually wait for the connection - it happened to work by
      // luck of timing (Mongoose buffers queries issued before a model
      // exists... except DB.Models itself is empty until this resolves, so
      // that buffering doesn't help callers that read DB.Models directly).
      await DB.instance.start();
    }
  }

  public static get backend(): BackendChoice {
    return DB._backend;
  }

  public static get Models(): IModels {
    if (!DB.instance) {
      DB.start();
    }
    return DB.instance!.Models;
  }

  public static get db() {
    if (!DB.instance) {
      DB.start();
    }

    if (DB._backend === 'drizzle') {
      return (DB.instance as DrizzleDatabase).database;
    }

    if (DB._backend === 'prisma') {
      return (DB.instance as PostgreSQLDatabase).client;
    }

    return connection.db;
  }

  public static async disconnect(): Promise<void> {
    if (DB.instance) {
      await DB.instance.disconnect();
    }
  }

  public static get databaseType(): DatabaseType {
    return DB._backend === 'mongo' ? DatabaseType.MONGODB : DatabaseType.POSTGRESQL;
  }

  public static get connection(): IDatabase {
    if (!DB.instance) {
      DB.start();
    }
    return DB.instance!;
  }

  public static get ormType(): 'mongoose' | 'prisma' | 'drizzle' {
    return DB._backend === 'mongo' ? 'mongoose' : DB._backend;
  }
}
