import { PlaceRepositoryFactory } from '../repositories/PlaceRepositoryFactory';
import { PrismaClient } from '../generated/prisma/client';
import { IDatabase, IModels } from './interfaces';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * PostgreSQL Database implementation using Prisma
 *
 * Note: This is a placeholder implementation.
 * Models will be implemented incrementally as we migrate from MongoDB.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export class PostgreSQLDatabase implements IDatabase {
  private static instance: PostgreSQLDatabase;
  private prisma: PrismaClient;
  private _models: IModels;

  constructor() {
    this.prisma = new PrismaClient({ adapter });

    // Initialize placeholder models
    // These will be replaced with actual implementations during migration
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
      Place: PlaceRepositoryFactory.create(),
      Award: null,
    };
  }

  public static getInstance(): PostgreSQLDatabase {
    if (!PostgreSQLDatabase.instance) {
      PostgreSQLDatabase.instance = new PostgreSQLDatabase();
    }
    return PostgreSQLDatabase.instance;
  }

  public async start(): Promise<void> {
    try {
      // Test the connection
      await this.prisma.$connect();
      console.log('PostgreSQL connection successful!');
    } catch (err) {
      console.error('Error connecting to PostgreSQL:', err);
      throw err;
    }
  }

  public get Models(): IModels {
    return this._models;
  }

  public getConnection(): PrismaClient {
    return this.prisma;
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Get Prisma client for direct queries
   */
  public get client(): PrismaClient {
    return this.prisma;
  }
}
