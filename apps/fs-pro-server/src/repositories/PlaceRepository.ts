import { IPlace } from '../controllers/places/places.model';

export interface IPlaceFilter {
  Type?: string;
  Code?: string;
  Name?: string;
  Region?: string;
}

export interface IPlaceRepository {
  findById(id: string): Promise<IPlace | null>;
  findAll(filter?: IPlaceFilter): Promise<IPlace[]>;
  /** Matches a Place whose Name OR Code equals `value` - used for the
   * name-slug lookup route (`GET /places/name/:name`). */
  findByNameOrCode(value: string): Promise<IPlace | null>;
  create(data: Partial<IPlace>): Promise<IPlace>;
  update(id: string, data: Partial<IPlace>): Promise<IPlace>;
  delete(id: string): Promise<void>;
}