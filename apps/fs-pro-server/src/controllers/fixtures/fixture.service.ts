import DB from '../../db';
import { Fixture } from './fixture.model';
import { FixtureRepositoryFactory } from '../../repositories/FixtureRepositoryFactory';
import { IFixtureFilter } from '../../repositories/FixtureRepository';

/**
 * Repository-backed functions below cover the identity/CRUD surface with no
 * arbitrary-query update in play - `update()` only accepts plain fields.
 * The match engine's own fixture-state write (`game/functions.ts`'s
 * `updateFixture`, formerly a raw `findOneAndUpdate`) is plain-field too and
 * now goes through `updateFixtureFields`. `findById` always comes back with
 * `HomeSideDetails`/`AwaySideDetails` populated (each with `PlayerStats`) -
 * see IFixtureRepository's doc comment.
 */
let fixtureRepo: ReturnType<typeof FixtureRepositoryFactory.create> | null = null;

function getFixtureRepo() {
  if (!fixtureRepo) {
    fixtureRepo = FixtureRepositoryFactory.create();
  }
  return fixtureRepo;
}

export async function getFixtureById(id: string) {
  return getFixtureRepo().findById(id);
}

export async function getFixtures(filter?: IFixtureFilter) {
  return getFixtureRepo().findAll(filter);
}

export async function createFixture(data: Partial<Fixture>) {
  return getFixtureRepo().create(data);
}

export async function updateFixtureFields(id: string, data: Partial<Fixture>) {
  return getFixtureRepo().update(id, data);
}

export async function deleteFixtureById(id: string) {
  return getFixtureRepo().delete(id);
}

export async function createFixtures(fixtures: Partial<Fixture>[]) {
  return getFixtureRepo().createMany(fixtures);
}

/**
 * fetchAll
 */
export function fetchAll(query: Record<string, unknown> = {}, select = '') {
  const h = { path: 'HomeSideDetails', populate: { path: 'PlayerStats' } };
  const a = { path: 'AwaySideDetails', populate: { path: 'PlayerStats' } };
  return DB.Models.Fixture.find(query)
    .populate(h)
    .select(select)
    .populate(a)
    .lean()
    .exec();
}

/**
 * FetchOneById
 *
 * Fetch a specific fixture by its id
 * @param id
 */
export function fetchOneById(
  id: string,
  populate: string | Record<string, unknown> | boolean = {
    path: 'ClubMatchDetails',
  }
) {
  const h = { path: 'HomeSideDetails', populate: { path: 'PlayerStats' } };
  const a = { path: 'AwaySideDetails', populate: { path: 'PlayerStats' } };

  console.log(populate);

  if (populate) {
    return DB.Models.Fixture.findById(id)
      .populate(populate)
      .populate(h)
      .populate(a)
      .lean()
      .exec();
  }

  return DB.Models.Fixture.findById(id).populate(h).populate(a).lean().exec();
}

export function deleteById(id: string) {
  return DB.Models.Fixture.findByIdAndDelete(id).lean().exec();
}

export async function deleteByRemove(id: string) {
  /**
  * Delete the Fixture
  */

  const doc = await DB.Models.Fixture.findById(id);

  if(!doc) {
    throw new Error(`Fixture ${id} does not exist`);
  }

  return doc.remove();
}

export function deleteAll(query: Record<string, unknown>) {
  return DB.Models.Fixture.deleteMany(query);
}
