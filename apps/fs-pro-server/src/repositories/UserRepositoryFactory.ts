import { IUserRepository } from './UserRepository';
import { DrizzleUserRepository } from './drizzle/UserRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class UserRepositoryFactory {
  static create(): IUserRepository {
    return new DrizzleUserRepository(DrizzleDatabase.getInstance().database);
  }
}
