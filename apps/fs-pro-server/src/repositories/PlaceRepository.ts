import { IPlace } from '../controllers/places/places.model';

export interface IPlaceRepository {
  findById(id: string): Promise<IPlace | null>;
  findAll(): Promise<IPlace[]>;
  create(data: Partial<IPlace>): Promise<IPlace>;
  update(id: string, data: Partial<IPlace>): Promise<IPlace>;
  delete(id: string): Promise<void>;
}