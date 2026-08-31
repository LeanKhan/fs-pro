/**
 * Shared helper for the migrate-*.ts scripts. The Drizzle schema (see
 * ../../db/drizzle/schema.ts) uses real uuid foreign keys, but every source
 * document in Mongo only carries the *other* database's id (a 24-char
 * ObjectId hex string) in its ref fields - inserting that string directly
 * into a uuid column fails outright (wrong format) even before considering
 * whether it points at anything real. `loadIdMap` reads back the mapping
 * every migrate-*.ts script itself wrote (`mongoId` on every table) so refs
 * can be resolved to the actual Postgres id of the already-migrated row.
 *
 * REQUIRED RUN ORDER (a table's ref fields only resolve once the table they
 * point at has already been migrated; nullable FKs mean running out of
 * order won't crash anything, it'll just leave those columns null forever
 * unless re-run after fixing the order):
 *
 *   1. migrate-places
 *   2. migrate-users
 *   3. migrate-managers        (Club left null - backfilled by step 5)
 *   4. migrate-competitions
 *   5. migrate-clubs           (also backfills managers.Club, closing the
 *                                Club<->Manager cycle)
 *   6. migrate-competition-clubs
 *   7. migrate-calendars
 *   8. migrate-days
 *   9. migrate-seasons
 *  10. migrate-players
 *  11. migrate-fixtures        (HomeSideDetails/AwaySideDetails left null -
 *                                backfilled by step 12; ReverseFixture is
 *                                resolved in a second pass within this same
 *                                script, since it's a self-reference)
 *  12. migrate-club-matches    (also backfills fixtures.HomeSideDetails/
 *                                AwaySideDetails, closing the
 *                                Fixture<->ClubMatchDetails cycle)
 *  13. migrate-player-matches
 *  14. migrate-awards          (needs clubs, seasons, players, AND managers
 *                                already migrated - Recipient is resolved
 *                                against whichever of Player/Manager
 *                                `Type` points to)
 */

type AnyDb = ReturnType<
  typeof import('../../db/drizzle/client').createDrizzleConnection
>['db'];

interface IdMappedTable {
  id: unknown;
  mongoId: unknown;
}

/**
 * Loads every already-migrated row's (mongoId -> Postgres id) pair for one
 * table in a single query, rather than a SELECT per ref being resolved.
 */
export async function loadIdMap(
  db: AnyDb,
  table: IdMappedTable
): Promise<Map<string, string>> {
  const rows = await (db as any)
    .select({ id: (table as any).id, mongoId: (table as any).mongoId })
    .from(table);

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.mongoId) {
      map.set(row.mongoId, row.id);
    }
  }
  return map;
}

/** `idMap.get(mongoId)` with the `null`-when-missing-or-absent handling
 * every ref field needs, instead of repeating `?? null` everywhere. */
export function resolve(
  idMap: Map<string, string>,
  mongoId: unknown
): string | null {
  if (!mongoId) return null;
  return idMap.get(mongoId.toString()) ?? null;
}

/**
 * Inserts a migrated Mongo document row, or updates the existing SQL row
 * when a previous run already inserted it. This makes the migration scripts
 * safe to re-run after fixing a bad transform or a partially failed batch.
 */
export function upsertByMongoId(
  db: AnyDb,
  table: IdMappedTable,
  values: Record<string, unknown>
) {
  const { id: _id, ...set } = values;

  return (db as any)
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: (table as any).mongoId,
      set,
    });
}
