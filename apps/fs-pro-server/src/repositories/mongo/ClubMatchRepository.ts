import { IClubMatchRepository } from '../ClubMatchRepository';
import DB from '../../db';
import { ClubMatchDetailsInterface } from '../../controllers/club-match/club-match.model';

export class MongoClubMatchRepository implements IClubMatchRepository {
  async findById(id: string): Promise<ClubMatchDetailsInterface | null> {
    return DB.Models.ClubMatch.findById(id).populate('PlayerStats').lean().exec();
  }

  async create(data: Partial<ClubMatchDetailsInterface>): Promise<ClubMatchDetailsInterface> {
    const clubMatch = await DB.Models.ClubMatch.create(data);
    return clubMatch.toObject();
  }

  async update(id: string, data: Partial<ClubMatchDetailsInterface>): Promise<ClubMatchDetailsInterface | null> {
    return DB.Models.ClubMatch.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<ClubMatchDetailsInterface> {
    const clubMatch = await DB.Models.ClubMatch.findByIdAndDelete(id).lean().exec();
    if (!clubMatch) {
      throw new Error(`ClubMatchDetails [${id}] does not exist`);
    }
    return clubMatch;
  }
}
