import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DrizzlePlaceRepository } from '../../repositories/drizzle/PlaceRepository';
import { IDatabase, IModels } from '../interfaces';
import * as schema from './full-schema';
import { MongoDatabase } from '../mongodb';
import { getMongoUrl } from '../mongoUrl';

export class DrizzleDatabase implements IDatabase {
  private static instance: DrizzleDatabase;
  private client: postgres.Sql;
  private drizzleDb: ReturnType<typeof drizzle<typeof schema>>;
  private _models: IModels;
  /**
   * Temporary bridge for the length of the migration: any entity that
   * doesn't have its own Drizzle repository yet falls back to this live
   * Mongo connection's raw Mongoose model - the exact same value
   * `MongoDatabase` would hand out, so behavior is unchanged for anything
   * not yet converted. This lets `USE_DRIZZLE=true` be flipped safely
   * before every entity is done, instead of all-or-nothing. Delete this
   * field (and every fallback line in `start()` below) once all entities
   * have a real Drizzle repository.
   */
  private mongoFallback: MongoDatabase;

  private constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is required when USE_DRIZZLE=true');
    }

    this.client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this.drizzleDb = drizzle(this.client, { schema });
    this.mongoFallback = MongoDatabase.getInstance(getMongoUrl());
    this._models = {} as IModels;
  }

  public static getInstance(): DrizzleDatabase {
    if (!DrizzleDatabase.instance) {
      DrizzleDatabase.instance = new DrizzleDatabase();
    }
    return DrizzleDatabase.instance;
  }

  public async start(): Promise<void> {
    try {
      await this.client`SELECT 1`;
      console.log('PostgreSQL Drizzle connection successful!');
    } catch (err) {
      console.error('Error connecting to PostgreSQL with Drizzle:', err);
      throw err;
    }

    // The fallback needs to be live before anything can safely read
    // `Models` - started here (not lazily) so it's guaranteed ready.
    await this.mongoFallback.start();
    const mongo = this.mongoFallback.Models;

    this._models = {
      // DrizzleCompetitionRepository/MongoCompetitionRepository do exist
      // (see repositories/{mongo,drizzle}/CompetitionRepository.ts) and now
      // cover the full Competition surface (including populate=true, via
      // reverse Clubs.League/Seasons.Competition lookups, and add-club/
      // add-season) - not wired in here, same one-slot-shared reason as
      // everything else in this list: GET /all's arbitrary query still
      // needs the raw Mongo model.
      Competition: mongo.Competition,
      // DrizzlePlayerRepository/MongoPlayerRepository do exist (see
      // repositories/{mongo,drizzle}/PlayerRepository.ts) and now cover
      // identity/CRUD, bulk `createMany`, age progression, and the
      // `getPlayerStats`/`allPlayerStats` aggregate-pipeline rewrites (SQL
      // joins+GROUP BY, in `player.service.ts` directly rather than the
      // repository) - GET /all's arbitrary query, bulk update-many, and
      // `getSpecificPlayerStats`'s genuinely arbitrary match/sort objects
      // still need the raw Mongo model. Same one-slot-shared reason as
      // everything else here.
      Player: mongo.Player,
      // DrizzleSeasonRepository/MongoSeasonRepository do exist (see
      // repositories/{mongo,drizzle}/SeasonRepository.ts) and cover the
      // identity/CRUD surface (findById always comes with Fixtures
      // populated) plus the fixture-generation/standings/prolegation game
      // loop's isolated plain-field writes (saveFixtures, setInitialStandings,
      // generate-fixtures) - GET /'s arbitrary query/populate/select/sort
      // combo and the finish-season flow's mixed $push/$set operator update
      // still need the raw Mongo model. Same one-slot-shared reason as
      // everything else here.
      Season: mongo.Season,
      // DrizzleClubRepository/MongoClubRepository do exist (see
      // repositories/{mongo,drizzle}/ClubRepository.ts) and now cover most
      // of the Club surface (including GET /clubs/all with Players/Manager
      // populated, add/remove-player via the Player repository, the
      // ratings recalculation, and DELETE) - but not wired in here:
      // DB.Models.Club is one slot shared by every consumer, and
      // /clubs/fetch's arbitrary Mongo query object and the CSV bulk
      // import still need the raw Mongo model.
      Club: mongo.Club,
      // DrizzleUserRepository/MongoUserRepository do exist (see
      // repositories/{mongo,drizzle}/UserRepository.ts) and now cover the
      // full real surface, including registration (`create()` - Club, its
      // one real coupling via `updateClubs`, is fully converted too) -
      // every route calls UserRepositoryFactory directly, not this slot
      // (see controllers/user/user.service.ts). The remaining raw
      // `DB.Models.User` functions in that file (`fetchUser`/
      // `getUserSession`/`fetchOneUser`/`updateManyUsers`) have no real
      // callers left - dead code, not a functional dependency on this slot.
      User: mongo.User,
      // DrizzleFixtureRepository/MongoFixtureRepository do exist (see
      // repositories/{mongo,drizzle}/FixtureRepository.ts) and cover the
      // identity/CRUD surface (findById always comes with
      // HomeSideDetails/AwaySideDetails+PlayerStats populated) plus the
      // match engine's own fixture-state write (game/functions.ts's
      // updateFixture, a plain-field update by id) and the friendly-fixture
      // create path - the explicit `?populate=` path on GET /fixtures/:id
      // still needs the raw Mongo model. Same one-slot-shared reason as
      // everything else here.
      Fixture: mongo.Fixture,
      // DrizzleCalendarRepository/MongoCalendarRepository do exist (see
      // repositories/{mongo,drizzle}/CalendarRepository.ts) and now cover
      // the identity/CRUD surface plus the whole Days-array-building game
      // loop's Calendar-side reads/writes (createSeasonsInTheYear,
      // setupDaysInYear(2), startYear's isActive flip via the repository's
      // own activateYear(), and the YearString-keyed lookups used to find
      // "the" calendar for a given year) - only GET /calendar/current's
      // arbitrary populate+pagination still needs the raw Mongo model. Same
      // one-slot-shared reason as everything else here.
      Calendar: mongo.Calendar,
      // DrizzleDayRepository/MongoDayRepository do exist (see
      // repositories/{mongo,drizzle}/DayRepository.ts) and cover
      // identity/CRUD, plus day.service.ts's own branching functions
      // (getDaysForYear/findDayByFixtureId/findNextPlayableDay/
      // markMatchPlayed) cover every real read/write - Matches.Fixture
      // populate is done via a batch fetch+merge against FixtureRepository,
      // since Matches is a jsonb array, not a relation. Nothing left raw
      // for Day specifically; this slot stays shared for consistency with
      // every other entity here.
      Day: mongo.Day,
      // DrizzleManagerRepository/MongoManagerRepository do exist (see
      // repositories/{mongo,drizzle}/ManagerRepository.ts) and cover the
      // full Manager surface now (including `populate=Club` and DELETE) -
      // still not wired in here, same one-slot-shared reason as everything
      // else in this list.
      Manager: mongo.Manager,
      // DrizzleClubMatchRepository/MongoClubMatchRepository do exist (see
      // repositories/{mongo,drizzle}/ClubMatchRepository.ts) and cover
      // identity/CRUD, including the one real call site
      // (game/functions.ts's savePlayerAndClubStats, the match-finish
      // persistence write) - PlayerStats comes back as full
      // PlayerMatchDetails rows via the reverse
      // playerMatchDetails.ClubMatchDetails FK on Postgres, a real array on
      // Mongo. This slot stays shared for consistency with every other
      // entity here; nothing left raw for ClubMatch specifically.
      ClubMatch: mongo.ClubMatch,
      // DrizzlePlayerMatchRepository/MongoPlayerMatchRepository do exist
      // (see repositories/{mongo,drizzle}/PlayerMatchRepository.ts) and
      // cover identity/CRUD, including the one real call site
      // (game/functions.ts's savePlayerAndClubStats, via
      // createManyPlayerMatches) - nothing left raw for PlayerMatch either.
      PlayerMatch: mongo.PlayerMatch,
      Place: new DrizzlePlaceRepository(this.drizzleDb),
      // DrizzleAwardRepository/MongoAwardRepository do exist (see
      // repositories/{mongo,drizzle}/AwardRepository.ts) and cover the one
      // real surface (`GET /awards/season/:id`'s `fetchAll`, and
      // `giveAwards`' bulk `createAwards`) - the polymorphic `Recipient`
      // populate (Player or Manager depending on `Type`) is resolved by a
      // small switch in `awards/index.ts`, not a schema-level relation
      // (Postgres can't FK one column against two tables). Nothing left
      // raw for Award specifically; this slot stays shared for consistency
      // with every other entity here.
      Award: mongo.Award,
      // DrizzleMatchReplayRepository/MongoMatchReplayRepository do exist
      // (see repositories/{mongo,drizzle}/MatchReplayRepository.ts) and
      // cover the only two real call sites (`saveReplay`/`fetchReplay` in
      // `match-replay.service.ts`) via a Fixture-keyed upsert (real
      // `onConflictDoUpdate` on Postgres, `findOneAndUpdate` upsert on
      // Mongo). Nothing left raw for MatchReplay.
      MatchReplay: mongo.MatchReplay,
    };
  }

  public get Models(): IModels {
    return this._models;
  }

  public getConnection() {
    return this.drizzleDb;
  }

  public async disconnect(): Promise<void> {
    await this.client.end();
    await this.mongoFallback.disconnect();
  }

  public get database() {
    return this.drizzleDb;
  }

  public get sql() {
    return this.client;
  }
}
