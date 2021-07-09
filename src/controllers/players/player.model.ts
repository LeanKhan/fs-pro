import { Schema, Document, model, Model } from 'mongoose';
import { IPlayerAttributes, IPlayerStats } from '../../interfaces/Player';

declare interface IPlayer extends Document {
  /** Name of the Player! */
  FirstName: string;
  LastName: string;
  Age: number;
  PlayerID: string;
  /** overall Player rating */
  Rating: number;
  /** Goals scored in total */
  GoalsScored: number;
  ShirtNumber: string;
  /** Collecting of Player's attributes */
  Attributes: IPlayerAttributes;
  Stats: IPlayerStats;
  isSigned: boolean;
  /** Monetary value of Player */
  Value: number;
  /** Some Players don't have clubs (free agents) hence can be undefined */
  ClubCode?: string;
}

export type PlayerModel = Model<IPlayer>;

const PlayerTransferHistorySchema: Schema = new Schema({
  message: String,
  type: String,
  amount: Number,
  from: String,
  to: String,
  date: String,
});

const PlayerRatingsHistory: Schema = new Schema({
  date: String,
  season: String,
  rating: Number,
  value: Number,
});

const PlayerAppearanceSchema: Schema = new Schema({
  head: {
    type: Object,
    variant: { type: String, default: 'default' },
    style: { type: String, default: 'light' },
  },
  complexion: {
    type: String,
    default: 'light',
  },
  hair: {
    type: Object,
    variant: { type: String, default: 'default' },
    style: { type: String, default: 'brown' },
  },
  eyebrows: {
    type: Object,
    variant: { type: String, default: 'default' },
    style: { type: String, default: 'brown' },
  },
  eyes: {
    type: Object,
    variant: { type: String, default: 'default' },
    style: { type: String, default: 'black' },
  },
  nose: {
    type: Object,
    variant: { type: String, default: 'default' },
    style: { type: String, default: 'light' },
  },
  mouth: {
    type: Object,
    variant: { type: String, default: 'default' },
    style: { type: String, default: 'light' },
  },
});

export class Player {
  private _model: Model<IPlayer>;

  constructor() {
    const PlayerSchema: Schema = new Schema(
      {
        FirstName: {
          type: String,
          required: true,
        },
        LastName: {
          type: String,
          required: true,
        },
        Nationality: String,
        Age: {
          type: Number,
        },
        PlayerID: String,
        Position: {
          type: String,
        },
        PositionNumber: Number,
        Attributes: {
          type: Object,
          PreferredFoot: { type: String },
          Speed: { type: Number, default: 0 },
          Shooting: { type: Number, default: 0 },
          LongPass: { type: Number, default: 0 },
          ShortPass: { type: Number, default: 0 },
          Mental: { type: Number, default: 0 },
          Control: { type: Number, default: 0 },
          Tackling: { type: Number, default: 0 },
          Dribbling: { type: Number, default: 0 },
          Setpiece: { type: Number, default: 0 },
          Strength: { type: Number, default: 0 },
          Stamina: { type: Number, default: 0 },
          Vision: { type: Number, default: 0 },
          ShotPower: { type: Number, default: 0 },
          Aggression: { type: Number, default: 0 },
          Interception: { type: Number, default: 0 },
          Keeping: { type: Number, default: 0 },
          AttackingMindset: { type: Boolean, default: false },
          DefensiveMindset: { type: Boolean, default: false },
        },
        /** overall Player rating over 100 - e.g 88 */
        Rating: Number,
        /** We may not need to record this though... We can use an aggregate function to calculate all this. */
        Stats: {
          type: Object,
          Goals: { type: Number, default: 0 },
          Saves: { type: Number, default: 0 },
          YellowCards: { type: Number, default: 0 },
          RedCards: { type: Number, default: 0 },
          Assists: { type: Number, default: 0 },
          CleanSheets: { type: Number, default: 0 },
          MOTM: { type: Number, default: 0 },
        },
        ShirtNumber: String,
        Value: {
          type: Number,
        },
        Form: { type: Number, default: 6 },
        Appearance: PlayerAppearanceSchema,
        TransferHistory: [PlayerTransferHistorySchema],
        /** Maybe this should be updated at the end of every season... */
        RatingsHistory: [PlayerRatingsHistory],
        isSigned: {
          type: Boolean,
          default: false,
        },
        ClubCode: {
          type: String,
          default: null,
        },
      },
      { timestamps: true }
    );

    this._model = model<IPlayer>('Player', PlayerSchema, 'Players');
  }

  public get model(): Model<IPlayer> {
    return this._model;
  }
}
