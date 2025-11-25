import { Model } from 'mongoose';

/**
 * Database abstraction layer interfaces
 * Allows switching between MongoDB and PostgreSQL
 */

export interface IModels {
  Competition: any;
  Player: any;
  Season: any;
  Club: any;
  User: any;
  Fixture: any;
  Calendar: any;
  Day: any;
  Manager: any;
  ClubMatch: any;
  PlayerMatch: any;
  Place: any;
  Award: any;
  [key: string]: any;
}

export interface IDatabase {
  /**
   * Get database models for querying
   */
  get Models(): IModels;

  /**
   * Start/connect to the database
   */
  start(): Promise<void> | void;

  /**
   * Disconnect from the database
   */
  disconnect(): Promise<void>;

  /**
   * Get the raw database connection (for advanced usage)
   */
  getConnection(): any;
}

export enum DatabaseType {
  MONGODB = 'mongodb',
  POSTGRESQL = 'postgresql',
}

export enum ORMType {
  MONGOOSE = 'mongoose',
  PRISMA = 'prisma',
  DRIZZLE = 'drizzle',
}
