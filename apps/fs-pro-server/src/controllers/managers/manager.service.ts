import DB from '../../db';
import { ManagerInterface } from './manager.model';
import { ITactic, tacticFromManager } from '../../state/PersistentState/Formations';
import { ManagerRepositoryFactory } from '../../repositories/ManagerRepositoryFactory';
import { IManagerFilter, IManagerReadOptions } from '../../repositories/ManagerRepository';

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
let managerRepo: ReturnType<typeof ManagerRepositoryFactory.create> | null = null;

function getManagerRepo() {
  if (!managerRepo) {
    managerRepo = ManagerRepositoryFactory.create();
  }
  return managerRepo;
}

export async function getManagerById(id: string, options?: IManagerReadOptions) {
  return getManagerRepo().findById(id, options);
}

export async function getManagers(filter?: IManagerFilter, options?: IManagerReadOptions) {
  return getManagerRepo().findAll(filter, options);
}

export async function createManager(data: Partial<ManagerInterface>) {
  return getManagerRepo().create(data);
}

export async function updateManager(id: string, data: Partial<ManagerInterface>) {
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
  const records = [...((manager?.Records as unknown as unknown[]) ?? []), record];
  return getManagerRepo().update(id, { ...fields, Records: records } as Partial<ManagerInterface>);
}

/**
 * fetchAllPlayers
 *
 * fetch multiple Players based on query
 * default behaviour is to send all players in the db
 */
export function fetchAll(
  query: Record<string, unknown> = {},
  populate?: string
): Promise<ManagerInterface[]> {
  if (populate == 'Club') {
    return DB.Models.Manager.find(query)
    .populate('Club', 'Name ClubCode LeagueCode')
    .populate('Nationality')
    .lean().exec();
  }
  return DB.Models.Manager.find(query).lean().exec();
}

/**
 * FetchOneById
 *
 * Fetch a specific Manager by id
 * @param id
 */
export function fetchOneById(
  id: string,
  populate = false
): Promise<ManagerInterface> {
  if (populate) {
    return DB.Models.Manager.findById(id).populate('Club').lean().exec();
  }
  return DB.Models.Manager.findById(id).lean().exec();
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
export async function resolveManagerTactic(managerId: unknown): Promise<ITactic> {
  if (!managerId) {
    return tacticFromManager(null);
  }

  try {
    const manager = await getManagerById(managerId as string);
    return tacticFromManager(manager);
  } catch (err) {
    console.error('Error resolving manager tactic, falling back to default =>', err);
    return tacticFromManager(null);
  }
}

/**
 * Update a single Manager by ID
 * @param id
 * @param update
 */
export function updateById(id: string, update: any): Promise<ManagerInterface> {
  return DB.Models.Manager.findByIdAndUpdate(id, update, { new: true })
    .lean()
    .exec();
}

/**
 * Fetch one specific Manager by a query
 *
 * Fetch a specific Manager by id
 * @param query
 */
export function fetchOne(query: any): Promise<ManagerInterface> {
  return DB.Models.Manager.findOne(query).lean().exec();
}

/**
 * Update a single Manager by a query condition
 *
 * @param query
 * @param update
 */
export function update(query: any, update: any): Promise<ManagerInterface> {
  return DB.Models.Manager.findByIdAndUpdate(query, update, { new: true })
    .lean()
    .exec();
}

/**
 * delete Manager by id
 * @param id
 */
export function deleteById(id: string) {
  return DB.Models.Manager.findByIdAndDelete(id).lean().exec();
}

/** Update Many Managers */
export function updateManagers(query: any, update: any) {
  return DB.Models.Manager.updateMany(query, update);
}

/**
 * Create new Manager
 *
 * @param m Manager making data
 * @returns - {error: boolean, result: any}
 */
export async function create(m: ManagerInterface) {
  const MANAGER = new DB.Models.Manager(m);

  return MANAGER.save()
    .then((manager: any) => ({ error: false, result: manager }))
    .catch((error: any) => ({ error: true, result: error }));
}
