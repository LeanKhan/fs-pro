import { IClubRepository, IClubFilter, IClubReadOptions } from '../ClubRepository';
import DB from '../../db';
import { ClubInterface } from '../../controllers/clubs/club.model';

export class MongoClubRepository implements IClubRepository {
  async findById(id: string, options: IClubReadOptions = {}): Promise<ClubInterface | null> {
    // Address.Country is auto-populated by club.model.ts's pre('findOne') hook.
    const query = DB.Models.Club.findById(id);
    if (options.withPlayersAndManager) query.populate('Players Manager');
    return query.lean().exec();
  }

  async findAll(filter: IClubFilter = {}, options: IClubReadOptions = {}): Promise<ClubInterface[]> {
    // Address.Country is auto-populated by club.model.ts's pre('find') hook.
    const query: Record<string, unknown> = {};
    if (filter.User !== undefined) query.User = filter.User;
    if (filter.League !== undefined) query.League = filter.League;

    const q = DB.Models.Club.find(query);
    if (options.withPlayersAndManager) q.populate('Players Manager');
    return q.lean().exec();
  }

  async create(data: Partial<ClubInterface>): Promise<ClubInterface> {
    const club = await DB.Models.Club.create(data);
    return club.toObject();
  }

  async update(id: string, data: Partial<ClubInterface>): Promise<ClubInterface | null> {
    return DB.Models.Club.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<ClubInterface> {
    const club = await DB.Models.Club.findByIdAndDelete(id).lean().exec();
    if (!club) {
      throw new Error(`Club [${id}] does not exist`);
    }
    return club;
  }
}
