import { DayInterface } from '../controllers/days/day.model';

export interface IDayFilter {
  /** Inclusive `Index` range. */
  indexFrom?: number;
  indexTo?: number;
}

/**
 * Deliberately minimal - Days is sparse (a row only exists for a day that
 * has a real, non-match calendar event), so this is just identity/CRUD plus
 * one range read.
 */
export interface IDayRepository {
  findById(id: string): Promise<DayInterface | null>;
  findAll(filter?: IDayFilter): Promise<DayInterface[]>;
  create(data: Partial<DayInterface>): Promise<DayInterface>;
  update(id: string, data: Partial<DayInterface>): Promise<DayInterface | null>;
  delete(id: string): Promise<DayInterface>;
}
