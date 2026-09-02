import { IDayRepository } from '../DayRepository';
import DB from '../../db';
import { DayInterface } from '../../controllers/days/day.model';

export class MongoDayRepository implements IDayRepository {
  async findById(id: string): Promise<DayInterface | null> {
    return DB.Models.Day.findById(id).lean().exec();
  }

  async create(data: Partial<DayInterface>): Promise<DayInterface> {
    const day = await DB.Models.Day.create(data);
    return day.toObject();
  }

  async createMany(data: Partial<DayInterface>[]): Promise<DayInterface[]> {
    const days = await DB.Models.Day.insertMany(data, { ordered: true });
    return days.map((d: any) => (d.toObject ? d.toObject() : d));
  }

  async update(id: string, data: Partial<DayInterface>): Promise<DayInterface | null> {
    return DB.Models.Day.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<DayInterface> {
    const day = await DB.Models.Day.findByIdAndDelete(id).lean().exec();
    if (!day) {
      throw new Error(`Day [${id}] does not exist`);
    }
    return day;
  }
}
