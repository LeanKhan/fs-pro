import { PlaceRepositoryFactory } from '../../repositories/PlaceRepositoryFactory';
import { IPlaceFilter } from '../../repositories/PlaceRepository';

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

export async function getAllPlaces(filter?: IPlaceFilter) {
  return getPlaceRepo().findAll(filter);
}

export async function getPlaceByNameOrCode(value: string) {
  return getPlaceRepo().findByNameOrCode(value);
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
