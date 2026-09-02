import { IPlaceRepository } from './PlaceRepository';
import { DrizzlePlaceRepository } from './drizzle/PlaceRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class PlaceRepositoryFactory {
  static create(): IPlaceRepository {
    return new DrizzlePlaceRepository(DrizzleDatabase.getInstance().database);
  }
}
