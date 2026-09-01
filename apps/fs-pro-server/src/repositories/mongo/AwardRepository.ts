import { IAwardRepository, IAwardFilter } from '../AwardRepository';
import DB from '../../db';
import { AwardInterface } from '../../controllers/awards/awards.model';

export class MongoAwardRepository implements IAwardRepository {
  async findAll(filter: IAwardFilter = {}): Promise<AwardInterface[]> {
    return DB.Models.Award.find(filter).lean().exec();
  }

  async createMany(data: Partial<AwardInterface>[]): Promise<AwardInterface[]> {
    const rows = await DB.Models.Award.insertMany(data, { ordered: true });
    return rows.map((r: any) => (r.toObject ? r.toObject() : r));
  }
}
