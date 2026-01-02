import DB from '../../db';
import { PlaceInterface } from './places.model';
import { PlaceRepositoryFactory } from '../../repositories/PlaceRepositoryFactory';

/**
 * fetchAll
 */
export function fetchMany(query: any = {}) {
  return DB.Models.Place.find(query).lean().exec();
}

/**
 * FetchOneById
 *
 * Fetch a specific season by its id
 * @param id
 */
export function fetchOneById(id: string) {
  return DB.Models.Place.findById(id).lean().exec();
}

/**
 * FetchOne by other criteria
 *
 * Fetch a specific season by its id
 * @param query
 */
export function fetchOne(query: Record<any, any>) {
  return DB.Models.Place.findOne(query).lean().exec();
}


/**
 * create new day
 * @param data
 */
export function createNew(data: any) {
  const $Place = new DB.Models.Place(data);

  return $Place
    .save()
    .then((p: any) => {
      return { error: false, result: p };
    })
    .catch((error: any) => ({ error: true, result: error }));
}

/**
 * Delete a Place by its id
 * @param id
 */
export function deleteById(id: string) {
  return DB.Models.Place.findByIdAndDelete(id).lean().exec();
}

/**
 * Find one Place and update
 * @param {} query
 * @param update
 */
export function findOneAndUpdate(
  query: Record<string, unknown>,
  update: any
): Promise<PlaceInterface> {
  return DB.Models.Place.findOneAndUpdate(query, update, { new: true })
    .lean()
    .exec();
}

let placeRepo: ReturnType<typeof PlaceRepositoryFactory.create> | null = null;

function getPlaceRepo() {
  if (!placeRepo) {
    placeRepo = PlaceRepositoryFactory.create();
  }
  return placeRepo;
}

export async function getPlace(id: string) {
  return getPlaceRepo().findById(id);
}

export async function getAllPlaces() {
  return getPlaceRepo().findAll();
}

export async function createPlace(data: any) {
  return getPlaceRepo().create(data);
}

export async function updatePlace(id: string, data: any) {
  return getPlaceRepo().update(id, data);
}

export async function deletePlace(id: string) {
  return getPlaceRepo().delete(id);
}