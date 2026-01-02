/**
 * Database abstraction layer
 * Supports both MongoDB and PostgreSQL
 *
 * Set USE_POSTGRESQL=true in .env to use PostgreSQL
 * Otherwise, defaults to MongoDB
 */
import { IDatabase, IModels, DatabaseType } from './interfaces';
import { MongoDatabase } from './mongodb';
import { PostgreSQLDatabase } from './postgresql';
import { connection } from 'mongoose';

// Determine which database to use
const USE_POSTGRESQL = process.env.USE_POSTGRESQL?.trim() === 'true';

// MongoDB URL configuration
let prod_db = '';
if (process.env.DEV_TEST?.trim()) {
  prod_db = process.env.DEV_MONGO_URL?.trim() as string;
} else {
  prod_db = process.env.PROD_MONGO_URL?.trim() as string;
}

export const MONGO_URL = prod_db;

/**
 * Database singleton
 * Automatically selects MongoDB or PostgreSQL based on environment
 */
export default class DB {

  private static instance: IDatabase;

  public static start() {
      console.log('DB Instance')
    if (!DB.instance) {
      if (USE_POSTGRESQL) {
        console.log('🐘 Using PostgreSQL database');
        DB.instance = PostgreSQLDatabase.getInstance();
      } else {
        console.log('🍃 Using MongoDB database');
        DB.instance = MongoDatabase.getInstance(MONGO_URL);
      }
      DB.instance.start();
    }
  }

  public static get Models(): IModels {
    if (!DB.instance) {
      DB.start();
    }
    return DB.instance!.Models;
  }

  public static get db() {
    if (USE_POSTGRESQL) {
      // Return Prisma client for PostgreSQL
      return (DB.instance as PostgreSQLDatabase).client;
    } else {
      // Return MongoDB connection
      return connection.db;
    }
  }

  public static async disconnect(): Promise<void> {
    if (DB.instance) {
      await DB.instance.disconnect();
    }
  }

  public static get databaseType(): DatabaseType {
    return USE_POSTGRESQL ? DatabaseType.POSTGRESQL : DatabaseType.MONGODB;
  }

  public static get connection(): IDatabase {
    if (!DB.instance) {
      DB.start();
    }
    return DB.instance!;
  }
}
