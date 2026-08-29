import { IPlaceRepository } from './PlaceRepository';
import { MongoPlaceRepository } from './mongo/PlaceRepository';
import { SQLPlaceRepository } from './sql/PlaceRepository';
import DB from '../db';
import { DatabaseType } from '../db/interfaces';
import { DrizzlePlaceRepository } from './drizzle/PlaceRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class PlaceRepositoryFactory {
  static create(): IPlaceRepository {
    if (DB.databaseType === DatabaseType.POSTGRESQL) {
      if (DB.ormType === 'drizzle') {
        return new DrizzlePlaceRepository(DrizzleDatabase.getInstance().database);
      }
      return new SQLPlaceRepository();
    }
    return new MongoPlaceRepository();
  }
}
