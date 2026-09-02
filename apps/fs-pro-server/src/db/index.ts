/**
 * Database abstraction layer - Postgres via Drizzle, exclusively.
 */
import { IModels } from './interfaces';
import { DrizzleDatabase } from './drizzle';

export default class DB {
  private static instance: DrizzleDatabase;

  public static async start(): Promise<void> {
    if (!DB.instance) {
      console.log('Using drizzle database backend');
      DB.instance = DrizzleDatabase.getInstance();
      await DB.instance.start();
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
    return (DB.instance as DrizzleDatabase).database;
  }

  public static async disconnect(): Promise<void> {
    if (DB.instance) {
      await DB.instance.disconnect();
    }
  }

  public static get connection(): DrizzleDatabase {
    if (!DB.instance) {
      DB.start();
    }
    return DB.instance!;
  }
}
