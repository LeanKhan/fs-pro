import { ICompetitionRepository, ICompetitionFilter } from '../CompetitionRepository';
import DB from '../../db';
import { CompetitionInterface } from '../../controllers/competitions/competition.model';

export class MongoCompetitionRepository implements ICompetitionRepository {
  async findById(id: string): Promise<CompetitionInterface | null> {
    // Country is auto-populated by competition.model.ts's pre('findOne') hook.
    return DB.Models.Competition.findById(id).lean().exec();
  }

  async findAll(filter: ICompetitionFilter = {}): Promise<CompetitionInterface[]> {
    // Country is auto-populated by competition.model.ts's pre('find') hook.
    return DB.Models.Competition.find(filter).lean().exec();
  }

  async create(data: Partial<CompetitionInterface>): Promise<CompetitionInterface> {
    const competition = await DB.Models.Competition.create(data);
    return competition.toObject();
  }

  async update(id: string, data: Partial<CompetitionInterface>): Promise<CompetitionInterface | null> {
    return DB.Models.Competition.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<CompetitionInterface> {
    const competition = await DB.Models.Competition.findByIdAndDelete(id).lean().exec();
    if (!competition) {
      throw new Error(`Competition [${id}] does not exist`);
    }
    return competition;
  }
}
