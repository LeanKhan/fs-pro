import { Schema, Document, model, Model } from 'mongoose';
import { IPlayer } from '../../interfaces/Player';
// import { Player } from '../models/player.model'; // Uncomment this after testing!

declare interface IClub extends Document {
  Name: string;
  ClubCode: string;
  AttackingClass: number;
  DefensiveClass: number;
  Players: IPlayer[];
  assets: {
    Kit: string;
    Logo: string;
    Stadium: string;
  };
  Rating: number;
  Address: {};
  Manager: string;
  Stadium: {};
  Stats: {};
  LeagueCode: string;
  League: string;
}

export interface Club {
  _id: string;
  Name: string;
  ClubCode: string;
  AttackingClass: number;
  DefensiveClass: number;
  Players: IPlayer[];
  assets: {
    Kit: string;
    Logo: string;
    Stadium: string;
  };
  Rating: number;
  Address: {};
  Manager: string;
  Stadium: {
    Name: string;
    Capacity: string;
    YearOccupied: string;
    Location: string;
  };
  Stats: {};
  LeagueCode: string;
  League: string;
}

export interface ClubModel extends Model<IClub> {}

// TODO:
// Figure out how to calculate Club rating o!

export class Club {
  private _model: Model<IClub>;

  constructor() {
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
          type: String,
          unique: true,
        },
        assets: {
          type: Object,
          Kit: String,
          Logo: String,
          Stadium: String,
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
          type: Object,
          Section: String,
          City: String,
          Country: String,
        },
        Budget: Number,
        Transactions: {},
        Stadium: {
          type: Object,
          Name: String,
          Capacity: String,
          Location: String,
          unique: true,
        },
        LeagueCode: String,
        League: { type: Schema.Types.ObjectId, ref: 'Competition' },
        Players: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
        User: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      { timestamps: true }
    );

    this._model = model<IClub>('Club', ClubSchema, 'Clubs');
  }

  public get model() {
    return this._model;
  }
}
