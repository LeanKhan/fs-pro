import { IPlaceRepository } from './PlaceRepository';
import { MongoPlaceRepository } from './mongo/PlaceRepository';
import { SQLPlaceRepository } from './sql/PlaceRepository';
import DB from '../db';
import { DatabaseType } from '../db/interfaces';

export class PlaceRepositoryFactory {
  static create(): IPlaceRepository {
    if (DB.databaseType === DatabaseType.POSTGRESQL) {
      return new SQLPlaceRepository();
    }
    return new MongoPlaceRepository();
  }
}