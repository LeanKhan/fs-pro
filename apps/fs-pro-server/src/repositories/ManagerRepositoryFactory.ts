import { IManagerRepository } from './ManagerRepository';
import { DrizzleManagerRepository } from './drizzle/ManagerRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class ManagerRepositoryFactory {
  static create(): IManagerRepository {
    return new DrizzleManagerRepository(DrizzleDatabase.getInstance().database);
  }
}
