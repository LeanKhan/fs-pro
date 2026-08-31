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
      // (see repositories/{mongo,drizzle}/CompetitionRepository.ts) and
      // cover the identity/CRUD surface - but not wired in here, same
      // one-slot-shared reason as Club/User/Manager above: populate=true
      // (Clubs/Seasons) and the Club/Season membership routes
      // (add-club/add-season) still need the raw Mongo model.
      Competition: mongo.Competition,
      Player: mongo.Player, // TODO: DrizzlePlayerRepository not built yet
      Season: mongo.Season, // TODO: DrizzleSeasonRepository not built yet
      // DrizzleClubRepository/MongoClubRepository do exist (see
      // repositories/{mongo,drizzle}/ClubRepository.ts) and are used
      // directly by the identity/CRUD surface (ClubRepositoryFactory, called
      // from controllers/clubs/club.service.ts) - but not wired in here:
      // DB.Models.Club is one slot shared by every consumer, and several
      // routes still need Mongo-operator ($push/$unset) semantics or
      // arbitrary populate specs the repository doesn't support (GET
      // /clubs/all, /clubs/fetch, add/remove-player, the CSV bulk import).
      Club: mongo.Club,
      // DrizzleUserRepository/MongoUserRepository do exist (see
      // repositories/{mongo,drizzle}/UserRepository.ts), but deliberately
      // aren't wired in here: DB.Models.User is one slot shared by every
      // consumer, and the Club-coupled routes (POST /join, /add-club(s),
      // /clubs/:id) still need it to be the raw Mongo model. The
      // repository-backed User routes call UserRepositoryFactory directly
      // instead - see controllers/user/user.service.ts.
      User: mongo.User,
      Fixture: mongo.Fixture, // TODO: DrizzleFixtureRepository not built yet
      // DrizzleCalendarRepository/MongoCalendarRepository do exist (see
      // repositories/{mongo,drizzle}/CalendarRepository.ts) and cover the
      // identity/CRUD surface - the Days-array-building game loop
      // (createSeasonsInTheYear, setupDaysInYear(2), startYear's
      // aggregation-pipeline update) still needs the raw Mongo model. Same
      // one-slot-shared reason as everything else here.
      Calendar: mongo.Calendar,
      Day: mongo.Day, // TODO: DrizzleDayRepository not built yet - GET /:year/days (its real read path) needs Matches.Fixture populate, which needs Fixture converted first.
      // DrizzleManagerRepository/MongoManagerRepository do exist (see
      // repositories/{mongo,drizzle}/ManagerRepository.ts) and cover the
      // full Manager surface now (including `populate=Club` and DELETE) -
      // still not wired in here, same one-slot-shared reason as everything
      // else in this list.
      Manager: mongo.Manager,
      ClubMatch: mongo.ClubMatch, // TODO: DrizzleClubMatchRepository not built yet
      PlayerMatch: mongo.PlayerMatch, // TODO: DrizzlePlayerMatchRepository not built yet
      Place: new DrizzlePlaceRepository(this.drizzleDb),
      Award: mongo.Award, // TODO: DrizzleAwardRepository not built yet
      MatchReplay: mongo.MatchReplay, // TODO: DrizzleMatchReplayRepository not built yet
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
