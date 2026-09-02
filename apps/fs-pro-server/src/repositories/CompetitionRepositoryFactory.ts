import { ICompetitionRepository } from './CompetitionRepository';
import { MongoCompetitionRepository } from './mongo/CompetitionRepository';
import { DrizzleCompetitionRepository } from './drizzle/CompetitionRepository';
import DB from '../db';
import { DrizzleDatabase } from '../db/drizzle';

/** No Prisma branch - see UserRepositoryFactory for why. */
export class CompetitionRepositoryFactory {
  static create(): ICompetitionRepository {
    if (DB.ormType === 'drizzle') {
      return new DrizzleCompetitionRepository(DrizzleDatabase.getInstance().database);
    }
    return new MongoCompetitionRepository();
  }
}
