/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Schema, Document, model, Model } from 'mongoose';
import { PlayerInterface } from '../../interfaces/Player';
import { IUser } from '../user/user.model';
// import { Player } from '../models/player.model'; // Uncomment this after testing!
// import DB from '../../db'; // Removed to prevent circular dependency

declare interface IClub extends Document {
  Name: string;
  ClubCode: string;
  AttackingClass: number;
  DefensiveClass: number;
  Players: any[]; // Array of ObjectIds
  assets?: {
    Kit?: string;
    Logo?: string;
    Stadium?: string;
    MainColor?: string;
  };
  Rating: number;
  GK_Rating: number;
  ATT_Rating: number;
  DEF_Rating: number;
  MID_Rating: number;
  Address?: {
    Section?: string;
    City?: string;
    Country?: any; // ObjectId reference
  };
  Manager?: any; // ObjectId reference
  Stadium?: {
    Name?: string;
    Capacity?: string;
    Location?: string;
  };
  Stats?: {
    LeagueTitles?: number;
    Cups?: number;
    MatchesWon?: number;
    MatchesLost?: number;
    MatchesDrawn?: number;
  };
  LeagueCode?: string;
  League?: any; // ObjectId reference
  User?: any; // ObjectId reference
  Budget?: number;
  Transactions?: any;
  Records?: any[];
  // Timestamps from mongoose
  createdAt: Date;
  updatedAt: Date;
}

export interface ClubInterface {
  _id?: string;
  Name: string;
  ClubCode: string;
  LeagueCode?: string;
  League?: string;
  AttackingClass: number;
  DefensiveClass: number;
  Players: PlayerInterface[];
  assets?: {
    Kit: string;
    Logo: string;
    Stadium: string;
  };
  Rating: number;
  GK_Rating: number;
  ATT_Rating: number;
  DEF_Rating: number;
  MID_Rating: number;
  Manager: string;
  Stadium?: {
    Name: string;
    Capacity: string;
    YearOccupied: string;
    Location: string;
  };
  Stats?: {
    LeagueTitles: number;
    Cups: number;
    MatchesWon: number;
    MatchesLost: number;
    MatchesDrawn: number;
  };
  Address?: {
    Section: string;
    City: string;
    Country: string;
  };
  User?: string | IUser;
  Budget?: number;
  Transactions?: unknown; // TODO: fix, use an actual type :)
}

export type ClubModel = Model<IClub>;

export class Club {
  private _model: Model<IClub>;

  constructor() {
    // Check if model already exists to prevent OverwriteModelError
    try {
      this._model = model<IClub>('Club');
    } catch (error) {
      // Model doesn't exist, create it
      const ClubSchema: Schema = new Schema(
      {
        Name: {
          type: String,
          required: true,
          unique: true,
        },
        ClubCode: {
          type: String,
          required: true,
          unique: true,
        },
        AttackingClass: {
          type: Number,
        },
        DefensiveClass: {
          type: Number,
        },
        Rating: { type: Number, default: 0 },
        GK_Rating: { type: Number, default: 0 },
        ATT_Rating: { type: Number, default: 0 },
        DEF_Rating: { type: Number, default: 0 },
        MID_Rating: { type: Number, default: 0 },
        Manager: {
          type: Schema.Types.ObjectId,
          ref: 'Manager',
        },
        assets: {
          type: Object,
          Kit: String,
          Logo: String,
          Stadium: String,
          MainColor: String,
        },
        Stats: {
          type: Object,
          LeagueTitles: Number,
          Cups: Number,
          MatchesWon: Number,
          MatchesLost: Number,
          MatchesDrawn: Number,
        },
        Address: {
          Section: { type: String },
          // TODO: Save City as ObjectID instead of String
          City: { type: String },
          Country: {
            type: Schema.Types.ObjectId,
            ref: 'Place',
            autopopulate: true,
          },
        },
        Budget: Number,
        Transactions: {},
        Records: [],
        Stadium: {
          Name: String,
          Capacity: String,
          Location: String,
        },
        LeagueCode: String,
        League: { type: Schema.Types.ObjectId, ref: 'Competition' },
        Players: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
        User: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      { timestamps: true }
    );

    const populate = function (this: IClub & Document, next: any) {
      this.populate('Address.Country');
      next();
    };

      ClubSchema.pre('find', populate).pre('findOne', populate);

      // Post-remove hook commented out to prevent circular dependency with DB
      // If needed, handle cleanup in the controller/service layer instead
      // ClubSchema.post('remove', async function (this: IClub & Document, doc, next) {
      //   await DB.Models.Competition.updateOne(
      //     { Clubs: this._id },
      //     { $pull: { Clubs: this._id } },
      //     { multi: true }
      //   ).exec();
      //   await DB.Models.User.updateOne(
      //     { Clubs: this._id },
      //     { $pull: { Clubs: this._id } },
      //     { multi: true }
      //   ).exec();
      //   await DB.Models.Manager.updateOne(
      //     { Club: this._id },
      //     { $unset: { Club: 1 } },
      //     { multi: true }
      //   ).exec();
      //   await DB.Models.Player.updateOne(
      //     { Club: this._id },
      //     { $unset: { Club: 1, ClubCode: 1 }, $set: { isSigned: false } },
      //     { multi: true }
      //   ).exec();
      //   await DB.Models.ClubMatch.deleteMany({ Club: this._id });
      //   next();
      // });

      this._model = model<IClub>('Club', ClubSchema, 'Clubs');
    }
  }

  public get model() {
    return this._model;
  }
}
