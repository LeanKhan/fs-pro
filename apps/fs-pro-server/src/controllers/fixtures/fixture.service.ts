import { Fixture } from './fixture.model';
import { FixtureRepositoryFactory } from '../../repositories/FixtureRepositoryFactory';
import {
  IFixtureFilter,
  IFixtureReadOptions,
} from '../../repositories/FixtureRepository';

/**
 * Repository-backed functions below cover the identity/CRUD surface with no
 * arbitrary-query update in play - `update()` only accepts plain fields.
 * The match engine's own fixture-state write (`game/functions.ts`'s
 * `updateFixture`, formerly a raw `findOneAndUpdate`) is plain-field too and
 * now goes through `updateFixtureFields`. `findById` always comes back with
 * `HomeSideDetails`/`AwaySideDetails` populated (each with `PlayerStats`) -
 * see IFixtureRepository's doc comment.
 */
let fixtureRepo: ReturnType<typeof FixtureRepositoryFactory.create> | null =
  null;

function getFixtureRepo() {
  if (!fixtureRepo) {
    fixtureRepo = FixtureRepositoryFactory.create();
  }
  return fixtureRepo;
}

export async function getFixtureById(id: string, options?: IFixtureReadOptions) {
  return getFixtureRepo().findById(id, options);
}

export async function getFixtureScheduleSummary() {
  return getFixtureRepo().scheduleSummary();
}

export async function getFixtures(
  filter?: IFixtureFilter,
  options?: IFixtureReadOptions
) {
  return getFixtureRepo().findAll(filter, options);
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

/** Every fixture scheduled on a given absolute day - the flat replacement
 * for the old `Day.Matches` embedded array. */
export async function getFixturesByDay(day: number) {
  return getFixtureRepo().findAll({ scheduledDay: day });
}

/** Every fixture scheduled within an inclusive day range - powers the
 * dashboard's "upcoming days" view. */
export async function getFixturesInRange(
  from: number,
  to: number,
  opts?: { played?: boolean }
) {
  return getFixtureRepo().findAll({
    scheduledDayFrom: from,
    scheduledDayTo: to,
    Played: opts?.played,
  });
}
