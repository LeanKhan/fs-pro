import { IPlaceRepository, IPlaceFilter } from '../PlaceRepository';
import DB from '../../db';
import { IPlace } from '../../controllers/places/places.model';

export class MongoPlaceRepository implements IPlaceRepository {
  async findById(id: string): Promise<IPlace | null> {
    return DB.Models.Place.findById(id).lean().exec();
  }

  async findAll(filter: IPlaceFilter = {}): Promise<IPlace[]> {
    return DB.Models.Place.find(filter).lean().exec();
  }

  async findByNameOrCode(value: string): Promise<IPlace | null> {
    return DB.Models.Place.findOne({ $or: [{ Name: value }, { Code: value }] })
      .lean()
      .exec();
  }

  async create(data: Partial<IPlace>): Promise<IPlace> {
    const place = await DB.Models.Place.create(data);
    return place.toObject();
  }

  async update(id: string, data: Partial<IPlace>): Promise<IPlace> {
    return DB.Models.Place.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<void> {
    await DB.Models.Place.findByIdAndDelete(id).exec();
  }
}
