/**
 * Database abstraction layer.
 * Supports MongoDB and PostgreSQL through Prisma or Drizzle.
 *
 * Set USE_POSTGRESQL=true in .env to use PostgreSQL.
 * Set USE_DRIZZLE=true with USE_POSTGRESQL=true to use Drizzle.
 * Otherwise, defaults to MongoDB.
 */
import { connection } from 'mongoose';
import { DatabaseType, IDatabase, IModels } from './interfaces';
import { DrizzleDatabase } from './drizzle';
import { MongoDatabase } from './mongodb';
import { PostgreSQLDatabase } from './postgresql';

const USE_POSTGRESQL = process.env.USE_POSTGRESQL?.trim() === 'true';
const USE_DRIZZLE = process.env.USE_DRIZZLE?.trim() === 'true';

let prod_db = '';
if (process.env.DEV_TEST?.trim()) {
  prod_db = process.env.DEV_MONGO_URL?.trim() as string;
} else {
  prod_db = process.env.PROD_MONGO_URL?.trim() as string;
}

export const MONGO_URL = prod_db;

export default class DB {
  private static instance: IDatabase;

  public static start() {
    if (!DB.instance) {
      if (USE_POSTGRESQL) {
        if (USE_DRIZZLE) {
          console.log('Using PostgreSQL database with Drizzle ORM');
          DB.instance = DrizzleDatabase.getInstance();
        } else {
          console.log('Using PostgreSQL database with Prisma ORM');
          DB.instance = PostgreSQLDatabase.getInstance();
        }
      } else {
        console.log('Using MongoDB database');
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
    if (!DB.instance) {
      DB.start();
    }

    if (USE_POSTGRESQL) {
      if (USE_DRIZZLE) {
        return (DB.instance as DrizzleDatabase).database;
      }

      return (DB.instance as PostgreSQLDatabase).client;
    }

    return connection.db;
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

  public static get ormType(): 'mongoose' | 'prisma' | 'drizzle' {
    if (!USE_POSTGRESQL) {
      return 'mongoose';
    }

    return USE_DRIZZLE ? 'drizzle' : 'prisma';
  }
}
