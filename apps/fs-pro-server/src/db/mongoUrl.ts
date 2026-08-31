/**
 * Which Mongo connection string to use - shared by the MongoDB-backed `DB`
 * path (`db/index.ts`) and `DrizzleDatabase` (which needs a live Mongo
 * fallback for any entity that doesn't have a Drizzle repository yet - see
 * `db/drizzle/index.ts`). Kept in its own module rather than exported from
 * `db/index.ts` so `db/drizzle/index.ts` can read it without an import
 * cycle (`db/index.ts` already imports `DrizzleDatabase`).
 */
export function getMongoUrl(): string {
  if (process.env.DEV_TEST?.trim()) {
    return process.env.DEV_MONGO_URL?.trim() as string;
  }
  return process.env.PROD_MONGO_URL?.trim() as string;
}
