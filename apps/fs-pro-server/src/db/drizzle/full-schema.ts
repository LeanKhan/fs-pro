/**
 * Combined schema + relations, for every place a Drizzle client needs to be
 * constructed (`drizzle(client, { schema })`) so `db.query.<table>.findMany`
 * can traverse the relations defined in `relations.ts`. Passing `./schema`
 * alone there compiles, but produces a client whose relational types are
 * `never` - always import this instead of `./schema` for that purpose.
 */
export * from './schema';
export * from './relations';
