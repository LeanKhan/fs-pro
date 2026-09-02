import { SeasonInterface } from './season.model';
import { SeasonRepositoryFactory } from '../../repositories/SeasonRepositoryFactory';
import { ISeasonFilter } from '../../repositories/SeasonRepository';

/**
 * Repository-backed functions below cover the identity/CRUD surface with no
 * arbitrary-query/populate or game-loop operator update in play -
 * `update()` only accepts plain fields, and `findById` always comes back
 * with `Fixtures` populated (matching the raw path's own default). See
 * ISeasonRepository's doc comment for what stays raw and why.
 */
let seasonRepo: ReturnType<typeof SeasonRepositoryFactory.create> | null = null;

function getSeasonRepo() {
  if (!seasonRepo) {
    seasonRepo = SeasonRepositoryFactory.create();
  }
  return seasonRepo;
}

export async function getSeasonById(id: string) {
  return getSeasonRepo().findById(id);
}

export async function getSeasons(filter?: ISeasonFilter) {
  return getSeasonRepo().findAll(filter);
}

export async function createSeasonRecord(data: Partial<SeasonInterface>) {
  return getSeasonRepo().create(data);
}

export async function updateSeasonFields(id: string, data: Partial<SeasonInterface>) {
  return getSeasonRepo().update(id, data);
}

export async function deleteSeasonById(id: string) {
  return getSeasonRepo().delete(id);
}


