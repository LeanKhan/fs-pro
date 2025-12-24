import { IPlaceRepository } from '../PlaceRepository';
import DB from '../../db';
import { IPlace } from '../../controllers/places/places.model';

export class MongoPlaceRepository implements IPlaceRepository {
  async findById(id: string): Promise<IPlace | null> {
    return DB.Models.Place.findById(id).exec();
  }

  async findAll(): Promise<IPlace[]> {
    return DB.Models.Place.find().exec();
  }

  async create(data: Partial<IPlace>): Promise<IPlace> {
    return DB.Models.Place.create(data);
  }

  async update(id: string, data: Partial<IPlace>): Promise<IPlace> {
    return DB.Models.Place.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async delete(id: string): Promise<void> {
    await DB.Models.Place.findByIdAndDelete(id).exec();
  }
}