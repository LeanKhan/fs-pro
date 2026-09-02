import { ICompetitionRepository } from './CompetitionRepository';
import { DrizzleCompetitionRepository } from './drizzle/CompetitionRepository';
import { DrizzleDatabase } from '../db/drizzle';

export class CompetitionRepositoryFactory {
  static create(): ICompetitionRepository {
    return new DrizzleCompetitionRepository(DrizzleDatabase.getInstance().database);
  }
}
