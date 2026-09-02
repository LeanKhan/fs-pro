import { IPlayerRepository, IPlayerFilter } from '../PlayerRepository';
import DB from '../../db';
import { PlayerInterface } from '../../controllers/players/player.model';

export class MongoPlayerRepository implements IPlayerRepository {
  async findById(id: string): Promise<PlayerInterface | null> {
    // Nationality is auto-populated by player.model.ts's pre('findOne') hook.
    return DB.Models.Player.findById(id).lean().exec();
  }

  async findAll(filter: IPlayerFilter = {}): Promise<PlayerInterface[]> {
    // Nationality is auto-populated by player.model.ts's pre('find') hook.
    return DB.Models.Player.find(filter).lean().exec();
  }

  async create(data: Partial<PlayerInterface>): Promise<PlayerInterface> {
    const player = await DB.Models.Player.create(data);
    return player.toObject();
  }

  async update(id: string, data: Partial<PlayerInterface>): Promise<PlayerInterface | null> {
    return DB.Models.Player.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async updateManyByIds(ids: string[], data: Partial<PlayerInterface>): Promise<void> {
    await DB.Models.Player.updateMany({ _id: { $in: ids } }, data);
  }

  async delete(id: string): Promise<PlayerInterface> {
    const doc = await DB.Models.Player.findById(id);
    if (!doc) {
      throw new Error(`Player [${id}] does not exist`);
    }
    // .remove() (not findByIdAndDelete) so the post('remove') hook fires -
    // see IPlayerRepository's doc comment.
    const removed = await doc.remove();
    return removed.toObject ? removed.toObject() : removed;
  }
}
