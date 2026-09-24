import { SeasonInterface } from '../controllers/seasons/season.model';

export interface ISeasonFilter {
  CompetitionId?: string;
  SeasonCode?: string;
}

/**
 * Seasons are open-play editions. `findById` comes back with `Fixtures`
 * populated (the reverse `fixtures.SeasonId` FK); `findAll` never does.
 * Edition lifecycle writes go through services/competitions/edition.service.ts,
 * not this repository; `update()` takes plain fields only.
 */
export interface ISeasonRepository {
  findById(id: string): Promise<SeasonInterface | null>;
  findAll(filter?: ISeasonFilter): Promise<SeasonInterface[]>;
  create(data: Partial<SeasonInterface>): Promise<SeasonInterface>;
  update(
    id: string,
    data: Partial<SeasonInterface>
  ): Promise<SeasonInterface | null>;
  delete(id: string): Promise<SeasonInterface>;
}
