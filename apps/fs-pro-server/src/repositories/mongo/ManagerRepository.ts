import { IManagerRepository, IManagerFilter, IManagerReadOptions } from '../ManagerRepository';
import DB from '../../db';
import { ManagerInterface } from '../../controllers/managers/manager.model';

export class MongoManagerRepository implements IManagerRepository {
  async findById(id: string, options: IManagerReadOptions = {}): Promise<ManagerInterface | null> {
    // Nationality is auto-populated by manager.model.ts's pre('findOne') hook.
    const query = DB.Models.Manager.findById(id);
    if (options.withClub) query.populate('Club', 'Name ClubCode LeagueCode');
    return query.lean().exec();
  }

  async findAll(filter: IManagerFilter = {}, options: IManagerReadOptions = {}): Promise<ManagerInterface[]> {
    // Nationality is auto-populated by manager.model.ts's pre('find') hook.
    const query = DB.Models.Manager.find(filter);
    if (options.withClub) query.populate('Club', 'Name ClubCode LeagueCode');
    return query.lean().exec();
  }

  async create(data: Partial<ManagerInterface>): Promise<ManagerInterface> {
    const manager = await DB.Models.Manager.create(data);
    return manager.toObject();
  }

  async update(id: string, data: Partial<ManagerInterface>): Promise<ManagerInterface | null> {
    return DB.Models.Manager.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<ManagerInterface> {
    const manager = await DB.Models.Manager.findByIdAndDelete(id).lean().exec();
    if (!manager) {
      throw new Error(`Manager [${id}] does not exist`);
    }
    return manager;
  }
}
