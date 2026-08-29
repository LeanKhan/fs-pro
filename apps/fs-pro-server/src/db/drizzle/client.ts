import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDrizzleConnection() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required for PostgreSQL migrations');
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  return { client, db };
}
