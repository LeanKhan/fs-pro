import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DrizzlePlaceRepository } from '../../repositories/drizzle/PlaceRepository';
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
      throw new Error('DATABASE_URL is required when USE_DRIZZLE=true');
    }

    this.client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this.drizzleDb = drizzle(this.client, { schema });

    this._models = {
      Competition: null,
      Player: null,
      Season: null,
      Club: null,
      User: null,
      Fixture: null,
      Calendar: null,
      Day: null,
      Manager: null,
      ClubMatch: null,
      PlayerMatch: null,
      Place: new DrizzlePlaceRepository(this.drizzleDb),
      Award: null,
      MatchReplay: null,
    };
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
