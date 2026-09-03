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

/** Whether every fixture scheduled on a given day has been played -
 * replaces `day.service.ts`'s old `Matches.every(m => m.Played)` check. */
export async function allFixturesPlayedForDay(day: number): Promise<boolean> {
  const dayFixtures = await getFixturesByDay(day);
  return dayFixtures.length > 0 && dayFixtures.every((f) => f.Played);
}

/** The next scheduled day, after `afterDay`, that still has an unplayed
 * fixture - used by `calendar.service.ts`'s `advanceDayIfDone` to find where
 * to move `CurrentDay`/`CurrentDate` to. `null` if there's nothing left
 * scheduled (end of the current season cycle). */
export async function findNextUnplayedDay(
  afterDay: number
): Promise<{ day: number; date: Date } | null> {
  const upcoming = await getFixtureRepo().findAll({
    scheduledDayFrom: afterDay + 1,
    Played: false,
  });
  if (upcoming.length === 0) return null;

  const next = upcoming.reduce((min, f) =>
    f.ScheduledDay! < min.ScheduledDay! ? f : min
  );

  return { day: next.ScheduledDay!, date: next.ScheduledDate! };
}
