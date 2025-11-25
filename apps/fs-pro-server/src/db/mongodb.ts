/* eslint-disable @typescript-eslint/unbound-method */
// tslint:disable: variable-name
import { connect, connection, Connection, set } from 'mongoose';
import {
  Competition,
  CompetitionModel,
} from '../controllers/competitions/competition.model';
import { Player, PlayerModel } from '../controllers/players/player.model';
import { Season, SeasonModel } from '../controllers/seasons/season.model';
import { Club, ClubModel } from '../controllers/clubs/club.model';
import { User, UserModel } from '../controllers/user/user.model';
import { Fixture, FixtureModel } from '../controllers/fixtures/fixture.model';
import {
  Calendar,
  CalendarModel,
} from '../controllers/calendar/calendar.model';
import { Day, DayModel } from '../controllers/days/day.model';
import { Manager, ManagerModel } from '../controllers/managers/manager.model';
import {
  ClubMatchDetails,
  ClubMatchDetailsModel,
} from '../controllers/club-match/club-match.model';
import {
  PlayerMatchDetails,
  PlayerMatchDetailsModel,
} from '../controllers/player-match/player-match.model';
import { Place, PlaceModel } from '../controllers/places/places.model';
import { Award, AwardModel } from '../controllers/awards/awards.model';
import log from '../helpers/logger';
import { IDatabase, IModels } from './interfaces';

/**
 * MongoDB Database implementation using Mongoose
 */
export class MongoDatabase implements IDatabase {
  private static instance: MongoDatabase;
  private _db: Connection;
  private _models: IModels;
  private mongoUrl: string;

  constructor(mongoUrl: string) {
    this.mongoUrl = mongoUrl;
    this._db = connection;
    this._models = {} as IModels;
  }

  public static getInstance(mongoUrl: string): MongoDatabase {
    if (!MongoDatabase.instance) {
      MongoDatabase.instance = new MongoDatabase(mongoUrl);
    }
    return MongoDatabase.instance;
  }

  public async start(): Promise<void> {
    try {
      const client = await connect(this.mongoUrl, { useNewUrlParser: true });
      console.log(
        `Connection to ${client.connection.db.databaseName} database successful!`
      );

      this._db = connection;
      this._db.on('open', this.connected);
      this._db.on('error', this.error);

      // Initialize models
      this._models = {
        Competition: new Competition().model,
        Player: new Player().model,
        Season: new Season().model,
        Club: new Club().model,
        User: new User().model,
        Fixture: new Fixture().model,
        Calendar: new Calendar().model,
        Day: new Day().model,
        Manager: new Manager().model,
        ClubMatch: new ClubMatchDetails().model,
        PlayerMatch: new PlayerMatchDetails().model,
        Place: new Place().model,
        Award: new Award().model,
      };

      // TODO: remove this later
      set('strictQuery', false);
      set('strict', false);
    } catch (err) {
      console.error(`Error in connecting to database: `, err);
      throw err;
    }
  }

  public get Models(): IModels {
    return this._models;
  }

  public getConnection(): Connection {
    return this._db;
  }

  public async disconnect(): Promise<void> {
    await connection.close();
  }

  public get db() {
    return connection.db;
  }

  private connected() {
    console.log('Mongoose has connected');
  }

  private error(error: any) {
    console.log(`Error in connection to database => ${error}`);
  }
}
