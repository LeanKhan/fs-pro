import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Fixture as FixtureInterface } from '../../controllers/fixtures/fixture.model';
import * as schema from '../../db/drizzle/full-schema';
import {
  fixtures,
  clubs,
  players,
  managers,
  clubMatchDetails,
  playerMatchDetails,
} from '../../db/drizzle/schema';
import {
  IFixtureRepository,
  IFixtureFilter,
  IFixtureReadOptions,
} from '../FixtureRepository';

type DrizzleDb = PostgresJsDatabase<typeof schema>;
type FixtureRow = typeof fixtures.$inferSelect;
type ClubRow = typeof clubs.$inferSelect;
type PlayerRow = typeof players.$inferSelect;
type ManagerRow = typeof managers.$inferSelect;
type ClubMatchDetailsRow = typeof clubMatchDetails.$inferSelect;
type PlayerMatchDetailsRow = typeof playerMatchDetails.$inferSelect;

/** `id` -> `_id` remap, applied at every nesting level (fixture, each side's
 * ClubMatchDetails, each PlayerStats entry) - same reason every other
 * Drizzle repository does this. */
function remapId<T extends { id: string; mongoId: string | null }>(row: T) {
  const { id, mongoId, ...rest } = row;
  return { _id: id, ...rest };
}

type EmbeddedClubRow = ClubRow & {
  players?: PlayerRow[];
  manager?: ManagerRow | null;
};

/** Same `_id` remap as every other Drizzle repository's Club shape, plus
 * the same conditional `Players`/`Manager` nesting `ClubRepository.ts`'s
 * `toClub()` applies - deliberately not reused from there: this doesn't
 * fetch `addressCountry`, so it leaves `Address` untouched rather than
 * risk `toClub()`'s handling of a relation that wasn't requested here.
 * `ManagerId`/`Manager` follow the same invariant as everywhere else: the
 * id always passes through via `...rest`, and `Manager` (the object) is
 * only added when the relation was actually fetched. */
function toEmbeddedClub(row: EmbeddedClubRow) {
  const { id, mongoId, players: playerRows, manager, ...rest } = row;
  return {
    _id: id,
    ...rest,
    ...(playerRows !== undefined ? { Players: playerRows.map(remapId) } : {}),
    ...(manager !== undefined && manager ? { Manager: remapId(manager) } : {}),
  };
}

function toSideDetails(
  row: (ClubMatchDetailsRow & { playerStats?: PlayerMatchDetailsRow[] }) | null
) {
  if (!row) return undefined;
  const { playerStats, ...rest } = row;
  return {
    ...remapId(rest),
    PlayerStats: (playerStats ?? []).map(remapId),
  };
}

/** Same `id` -> `_id` remap every other Drizzle repository does.
 * `HomeTeamId`/`AwayTeamId`/`HomeSideDetailsId`/`AwaySideDetailsId` always
 * pass through unchanged as bare ids (via `...rest`, straight off the
 * renamed schema columns) - `HomeTeam`/`AwayTeam`/`HomeSideDetails`/
 * `AwaySideDetails` (the clean, un-suffixed names) are only ever added,
 * never set to a bare id, and only when the corresponding relation was
 * actually fetched. `HomeSideDetails`/`AwaySideDetails` are the always-on
 * baseline for `findById`/`findAll` (see IFixtureRepository's doc
 * comment) - `HomeTeam`/`AwayTeam` are opt-in via IFixtureReadOptions.
 * withClub. Neither is ever populated on `create`/`update`/`delete`
 * (nothing to join against a freshly-written row), so those methods
 * simply omit both clean-name keys - never set them to a raw id. */
function toFixture(
  row: FixtureRow & {
    homeTeam?: EmbeddedClubRow | null;
    awayTeam?: EmbeddedClubRow | null;
    homeSideDetails?:
      | (ClubMatchDetailsRow & { playerStats?: PlayerMatchDetailsRow[] })
      | null;
    awaySideDetails?:
      | (ClubMatchDetailsRow & { playerStats?: PlayerMatchDetailsRow[] })
      | null;
  }
): FixtureInterface {
  const { id, mongoId, homeTeam, awayTeam, homeSideDetails, awaySideDetails, ...rest } =
    row;

  const homeSide = toSideDetails(homeSideDetails ?? null);
  const awaySide = toSideDetails(awaySideDetails ?? null);

  return {
    _id: id,
    ...rest,
    ...(homeTeam !== undefined && homeTeam
      ? { HomeTeam: toEmbeddedClub(homeTeam) }
      : {}),
    ...(awayTeam !== undefined && awayTeam
      ? { AwayTeam: toEmbeddedClub(awayTeam) }
      : {}),
    ...(homeSide ? { HomeSideDetails: homeSide } : {}),
    ...(awaySide ? { AwaySideDetails: awaySide } : {}),
  } as unknown as FixtureInterface;
}

export class DrizzleFixtureRepository implements IFixtureRepository {
  constructor(private db: DrizzleDb) {}

  async findById(
    id: string,
    options: IFixtureReadOptions = {}
  ): Promise<FixtureInterface | null> {
    const fixture = await this.db.query.fixtures.findFirst({
      where: eq(fixtures.id, id),
      with: {
        ...(options.withClub
          ? {
              homeTeam: { with: { players: true, manager: true } },
              awayTeam: { with: { players: true, manager: true } },
            }
          : {}),

        homeSideDetails: {
          with: {
            playerStats: true,
          },
        },

        awaySideDetails: {
          with: {
            playerStats: true,
          },
        },
      },
    });
    return fixture ? toFixture(fixture) : null;
  }

  async findAll(
    filter: IFixtureFilter = {},
    options: IFixtureReadOptions = {}
  ): Promise<FixtureInterface[]> {
    const conditions = [];
    if (filter.SeasonId !== undefined)
      conditions.push(eq(fixtures.SeasonId, filter.SeasonId));
    if (filter.Played !== undefined)
      conditions.push(eq(fixtures.Played, filter.Played));
    if (filter.ids !== undefined)
      conditions.push(inArray(fixtures.id, filter.ids));
    if (filter.scheduledDay !== undefined)
      conditions.push(eq(fixtures.ScheduledDay, filter.scheduledDay));
    if (filter.scheduledDayFrom !== undefined)
      conditions.push(gte(fixtures.ScheduledDay, filter.scheduledDayFrom));
    if (filter.scheduledDayTo !== undefined)
      conditions.push(lte(fixtures.ScheduledDay, filter.scheduledDayTo));
    const rows = await this.db.query.fixtures.findMany({
      where: conditions.length ? and(...conditions) : undefined,

      with: {
        ...(options.withClub
          ? {
              homeTeam: { with: { players: true, manager: true } },
              awayTeam: { with: { players: true, manager: true } },
            }
          : {}),

        homeSideDetails: {
          with: {
            playerStats: true,
          },
        },

        awaySideDetails: {
          with: {
            playerStats: true,
          },
        },
      },
    });
    return rows.map(toFixture);
  }

  async create(data: Partial<FixtureInterface>): Promise<FixtureInterface> {
    const [fixture] = await this.db
      .insert(fixtures)
      .values({
        ...(data as typeof fixtures.$inferInsert),
        updatedAt: new Date(),
      })
      .returning();

    return toFixture(fixture);
  }

  async createMany(
    data: Partial<FixtureInterface>[]
  ): Promise<FixtureInterface[]> {
    if (data.length === 0) return [];
    const rows = await this.db
      .insert(fixtures)
      .values(
        data.map((d) => ({
          ...(d as typeof fixtures.$inferInsert),
          updatedAt: new Date(),
        }))
      )
      .returning();

    return rows.map((row) => toFixture(row));
  }

  async update(
    id: string,
    data: Partial<FixtureInterface>
  ): Promise<FixtureInterface | null> {
    const [fixture] = await this.db
      .update(fixtures)
      .set({
        ...(data as Partial<typeof fixtures.$inferInsert>),
        updatedAt: new Date(),
      })
      .where(eq(fixtures.id, id))
      .returning();

    return fixture ? toFixture(fixture) : null;
  }

  async delete(id: string): Promise<FixtureInterface> {
    const [fixture] = await this.db
      .delete(fixtures)
      .where(eq(fixtures.id, id))
      .returning();
    if (!fixture) {
      throw new Error(`Fixture [${id}] does not exist`);
    }
    return toFixture(fixture);
  }
}
