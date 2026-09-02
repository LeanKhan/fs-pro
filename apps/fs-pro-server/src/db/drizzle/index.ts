import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DrizzlePlaceRepository } from '../../repositories/drizzle/PlaceRepository';
import { DrizzleCompetitionRepository } from '../../repositories/drizzle/CompetitionRepository';
import { DrizzlePlayerRepository } from '../../repositories/drizzle/PlayerRepository';
import { DrizzleSeasonRepository } from '../../repositories/drizzle/SeasonRepository';
import { DrizzleClubRepository } from '../../repositories/drizzle/ClubRepository';
import { DrizzleUserRepository } from '../../repositories/drizzle/UserRepository';
import { DrizzleFixtureRepository } from '../../repositories/drizzle/FixtureRepository';
import { DrizzleCalendarRepository } from '../../repositories/drizzle/CalendarRepository';
import { DrizzleDayRepository } from '../../repositories/drizzle/DayRepository';
import { DrizzleManagerRepository } from '../../repositories/drizzle/ManagerRepository';
import { DrizzleClubMatchRepository } from '../../repositories/drizzle/ClubMatchRepository';
import { DrizzlePlayerMatchRepository } from '../../repositories/drizzle/PlayerMatchRepository';
import { DrizzleAwardRepository } from '../../repositories/drizzle/AwardRepository';
import { DrizzleMatchReplayRepository } from '../../repositories/drizzle/MatchReplayRepository';
import { IDatabase, IModels } from '../interfaces';
import * as schema from './full-schema';

export class DrizzleDatabase implements IDatabase {
  private static instance: DrizzleDatabase;
  private client: postgres.Sql;
  private drizzleDb: ReturnType<typeof drizzle<typeof schema>>;
  private _models: IModels;

  private constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    this.client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this.drizzleDb = drizzle(this.client, { schema });
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

    this._models = {
      Competition: new DrizzleCompetitionRepository(this.drizzleDb),
      Player: new DrizzlePlayerRepository(this.drizzleDb),
      Season: new DrizzleSeasonRepository(this.drizzleDb),
      Club: new DrizzleClubRepository(this.drizzleDb),
      User: new DrizzleUserRepository(this.drizzleDb),
      Fixture: new DrizzleFixtureRepository(this.drizzleDb),
      Calendar: new DrizzleCalendarRepository(this.drizzleDb),
      Day: new DrizzleDayRepository(this.drizzleDb),
      Manager: new DrizzleManagerRepository(this.drizzleDb),
      ClubMatch: new DrizzleClubMatchRepository(this.drizzleDb),
      PlayerMatch: new DrizzlePlayerMatchRepository(this.drizzleDb),
      Place: new DrizzlePlaceRepository(this.drizzleDb),
      Award: new DrizzleAwardRepository(this.drizzleDb),
      MatchReplay: new DrizzleMatchReplayRepository(this.drizzleDb),
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
  }

  public get database() {
    return this.drizzleDb;
  }

  public get sql() {
    return this.client;
  }
}
