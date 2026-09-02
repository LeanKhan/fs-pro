import { ISeasonRepository, ISeasonFilter } from '../SeasonRepository';
import DB from '../../db';
import { SeasonInterface } from '../../controllers/seasons/season.model';

export class MongoSeasonRepository implements ISeasonRepository {
  async findById(id: string): Promise<SeasonInterface | null> {
    return DB.Models.Season.findById(id).populate('Fixtures').lean().exec();
  }

  async findAll(filter: ISeasonFilter = {}): Promise<SeasonInterface[]> {
    return DB.Models.Season.find(filter).lean().exec();
  }

  async create(data: Partial<SeasonInterface>): Promise<SeasonInterface> {
    const season = await DB.Models.Season.create(data);
    return season.toObject();
  }

  async update(id: string, data: Partial<SeasonInterface>): Promise<SeasonInterface | null> {
    return DB.Models.Season.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<SeasonInterface> {
    // No active post('remove') hook on Season (commented out in the
    // schema), so a plain findByIdAndDelete is equivalent to the old raw
    // deleteByRemove's `.remove()` - no cascade to preserve.
    const season = await DB.Models.Season.findByIdAndDelete(id).lean().exec();
    if (!season) {
      throw new Error(`Season [${id}] does not exist`);
    }
    return season;
  }
}
