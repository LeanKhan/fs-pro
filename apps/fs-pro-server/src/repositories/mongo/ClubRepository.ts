import { IClubRepository, IClubFilter } from '../ClubRepository';
import DB from '../../db';
import { ClubInterface } from '../../controllers/clubs/club.model';

export class MongoClubRepository implements IClubRepository {
  async findById(id: string): Promise<ClubInterface | null> {
    // Address.Country is auto-populated by club.model.ts's pre('findOne') hook.
    return DB.Models.Club.findById(id).lean().exec();
  }

  async findAll(filter: IClubFilter = {}): Promise<ClubInterface[]> {
    // Address.Country is auto-populated by club.model.ts's pre('find') hook.
    const query: Record<string, unknown> = {};
    if (filter.User !== undefined) query.User = filter.User;
    if (filter.League !== undefined) query.League = filter.League;

    return DB.Models.Club.find(query).lean().exec();
  }

  async create(data: Partial<ClubInterface>): Promise<ClubInterface> {
    const club = await DB.Models.Club.create(data);
    return club.toObject();
  }

  async update(id: string, data: Partial<ClubInterface>): Promise<ClubInterface | null> {
    return DB.Models.Club.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }
}
