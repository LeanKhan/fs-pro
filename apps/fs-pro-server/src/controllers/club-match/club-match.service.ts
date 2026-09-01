import DB from '../../db';
import { ClubMatchDetailsInterface } from './club-match.model';
import { ClubMatchRepositoryFactory } from '../../repositories/ClubMatchRepositoryFactory';
// import { ClubMatchDetailsInterface } from './day.model';

/**
 * Repository-backed - the only real call site is `game/functions.ts`'s
 * `savePlayerAndClubStats`. Every other function below is dead code (no
 * remaining callers), left as-is.
 */
let clubMatchRepo: ReturnType<typeof ClubMatchRepositoryFactory.create> | null = null;

function getClubMatchRepo() {
  if (!clubMatchRepo) {
    clubMatchRepo = ClubMatchRepositoryFactory.create();
  }
  return clubMatchRepo;
}

export async function getClubMatchById(id: string) {
  return getClubMatchRepo().findById(id);
}

export async function createClubMatch(data: Partial<ClubMatchDetailsInterface>) {
  return getClubMatchRepo().create(data);
}

export async function updateClubMatchFields(id: string, data: Partial<ClubMatchDetailsInterface>) {
  return getClubMatchRepo().update(id, data);
}

export async function deleteClubMatchById(id: string) {
  return getClubMatchRepo().delete(id);
}

/**
 * fetchAll ClubMatchDetails
 */
export function fetchAll(query: Record<string, unknown> = {}) {
  return DB.Models.ClubMatch.find(query).lean().exec();
}

/**
 * fetch many ClubMatchDetails
 * @param query
 */
export function fetchMany(query: Record<string, unknown> = {}) {
  return DB.Models.ClubMatch.find(query).populate('PlayerStats').lean().exec();
}

/**
 * Fetch One By Id
 *
 * Fetch a specific day by its id
 * @param id
 */
export function fetchOneById(
  id: string,
  populate: string | Record<string, unknown> | boolean = 'PlayerStats'
): Promise<ClubMatchDetailsInterface> {
  if (populate) {
    return DB.Models.ClubMatch.findById(id).populate(populate).lean().exec();
  }

  return DB.Models.ClubMatch.findById(id).lean().exec();
}

/**
 * Find a One Day By any condition...
 *
 *
 * @param query the condition e.g Matche.length == 0
 */
export function findOne(
  query: any,
  populate: string | Record<string, unknown> | boolean = 'PlayerStats'
): Promise<ClubMatchDetailsInterface> {
  if (populate)
    return DB.Models.ClubMatch.findOne(query).populate(populate).lean().exec();

  return DB.Models.ClubMatch.findOne(query).lean().exec();
}

/**
 * Delete a Day by its id
 * @param id
 */
export function deleteById(id: string) {
  return DB.Models.ClubMatch.findByIdAndDelete(id).lean().exec();
}

/**
 * Find one Day and update
 * @param {} query
 * @param update
 */
export function findOneAndUpdate(
  query: Record<string, unknown>,
  update: any
): Promise<ClubMatchDetailsInterface> {
  return DB.Models.ClubMatch.findOneAndUpdate(query, update, { new: true })
    .lean()
    .exec();
}

/**
 * Create many Day documents from raw ClubMatchDetails objects
 * @param {ClubMatchDetailsInterface} ClubMatchDetails raw ClubMatchDetails objects
 * @returns Array of Ids of created Documents
 */
export function createMany(ClubMatchDetails: ClubMatchDetailsInterface[]) {
  return DB.Models.ClubMatch.insertMany(ClubMatchDetails, { ordered: true });
}
