import { IPlayerMatchRepository } from '../PlayerMatchRepository';
import DB from '../../db';
import { PlayerMatchDetailsInterface } from '../../controllers/player-match/player-match.model';

export class MongoPlayerMatchRepository implements IPlayerMatchRepository {
  async findById(id: string): Promise<PlayerMatchDetailsInterface | null> {
    return DB.Models.PlayerMatch.findById(id).lean().exec();
  }

  async createMany(data: Partial<PlayerMatchDetailsInterface>[]): Promise<PlayerMatchDetailsInterface[]> {
    const rows = await DB.Models.PlayerMatch.insertMany(data, { ordered: true });
    return rows.map((r: any) => (r.toObject ? r.toObject() : r));
  }

  async update(id: string, data: Partial<PlayerMatchDetailsInterface>): Promise<PlayerMatchDetailsInterface | null> {
    return DB.Models.PlayerMatch.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<PlayerMatchDetailsInterface> {
    const playerMatch = await DB.Models.PlayerMatch.findByIdAndDelete(id).lean().exec();
    if (!playerMatch) {
      throw new Error(`PlayerMatchDetails [${id}] does not exist`);
    }
    return playerMatch;
  }
}
