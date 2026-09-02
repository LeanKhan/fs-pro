import { ManagerInterface } from './manager.model';
import {
  ITactic,
  tacticFromManager,
} from '../../state/PersistentState/Formations';
import { ManagerRepositoryFactory } from '../../repositories/ManagerRepositoryFactory';
import {
  IManagerFilter,
  IManagerReadOptions,
} from '../../repositories/ManagerRepository';
import { DrizzleDatabase } from '../../db/drizzle';
import { managers } from '../../db/drizzle/schema';
import { sql as drizzleSql } from 'drizzle-orm';

/**
 * Repository-backed functions below now cover the `populate=Club` surface
 * too (`GET /managers/unemployed`, `GET /managers?populate=Club`,
 * `GET /managers/:id?populate=true`), now that Club has its own repository
 * - pass `{ withClub: true }` to get the same `Name`/`ClubCode`/`LeagueCode`
 * projection the raw `.populate('Club', ...)` call used. DELETE
 * /managers/:id is fully repository-backed now too (`deleteManagerById`
 * below) - its Club-side write goes through `club.service.ts`'s
 * `appendClubRecord`. See FUTURE-PLANS.md for the full writeup.
 */
let managerRepo: ReturnType<typeof ManagerRepositoryFactory.create> | null =
  null;

function getManagerRepo() {
  if (!managerRepo) {
    managerRepo = ManagerRepositoryFactory.create();
  }
  return managerRepo;
}

export async function getManagerById(
  id: string,
  options?: IManagerReadOptions
) {
  return getManagerRepo().findById(id, options);
}

export async function getManagers(
  filter?: IManagerFilter,
  options?: IManagerReadOptions
) {
  return getManagerRepo().findAll(filter, options);
}

export async function createManager(data: Partial<ManagerInterface>) {
  return getManagerRepo().create(data);
}

export async function updateManager(
  id: string,
  data: Partial<ManagerInterface>
) {
  return getManagerRepo().update(id, data);
}

export async function deleteManagerById(id: string) {
  return getManagerRepo().delete(id);
}

/**
 * Update a Manager's plain fields and append one entry to its Records array
 * in the same write - the Manager-side equivalent of `club.service.ts`'s
 * `appendClubRecord`, used by the hire/fire-manager flow in
 * `club.controller.ts` (which used to send `$set`/`$push` operators straight
 * to `updateById`).
 */
export async function appendManagerRecord(
  id: string,
  fields: Record<string, unknown>,
  record: unknown
) {
  const manager = await getManagerRepo().findById(id);
  const records = [
    ...((manager?.Records as unknown as unknown[]) ?? []),
    record,
  ];
  return getManagerRepo().update(id, {
    ...fields,
    Records: records,
  } as Partial<ManagerInterface>);
}

/**
 * A club's manager's preferred tactic, falling back to the default tactic
 * if there's no manager, none is set, or the lookup fails. Shared by
 * App.setupGame (synchronous path) and jobs/matchQueue.ts (queued-worker
 * path) so both fall back the same way - only ever call this from the main
 * thread (needs a live DB connection); a worker_thread must be handed the
 * already-resolved tactic instead.
 *
 * Uses the repository (not the raw `fetchOneById` below) - this only reads
 * PreferredFormation/PreferredStyle, no Club involved, so it's safe to
 * convert and worth converting: it's on the critical path for every match
 * kickoff.
 */
export async function resolveManagerTactic(
  managerId: unknown
): Promise<ITactic> {
  if (!managerId) {
    return tacticFromManager(null);
  }

  try {
    const manager = await getManagerById(managerId as string);
    return tacticFromManager(manager);
  } catch (err) {
    console.error(
      'Error resolving manager tactic, falling back to default =>',
      err
    );
    return tacticFromManager(null);
  }
}

/**
 * Increment every Manager's Age by 1 - end-of-year progression, called
 * alongside Player's own age-progression bulk update (see
 * `player.controller.ts`'s `increaseAllPeoplesAge`). Unlike most bulk
 * operator updates left raw elsewhere in this migration, this one was
 * genuinely simple to convert: unconditional (no filter) and the same
 * fixed `+1` for every row, so it's a single SQL `UPDATE ... SET "Age" =
 * "Age" + 1` under `backend=drizzle` - no per-row read-modify-write needed.
 */
export function incrementAllManagersAge() {
  const db = DrizzleDatabase.getInstance().database;
  return db.update(managers).set({ Age: drizzleSql`${managers.Age} + 1` });
}
