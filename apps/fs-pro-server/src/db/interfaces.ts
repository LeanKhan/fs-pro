/**
 * Database abstraction layer interfaces
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
  MatchReplay: any;
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
