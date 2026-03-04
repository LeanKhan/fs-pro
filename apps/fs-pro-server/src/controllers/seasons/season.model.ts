import { Schema, Document, model, Model } from 'mongoose';
import { CompetitionInterface } from '../competitions/competition.model';
import { Fixture } from '../fixtures/fixture.model';
// import DB from '../../db'; // Removed to prevent circular dependency

export interface SeasonInterface {
  _id?: string;
  SeasonCode: string;
  Title: string;
  Competition: string | CompetitionInterface;
  CompetitionCode: string;
  Winner: string;
  Promoted: string[];
  Relegated: string[];
  isFinished: boolean;
  isStarted: boolean;
  Status: string;
  StartDate: Date;
  EndDate: Date;
  Year: string;
  Calendar: string;
  Fixtures: Fixture[];
  Standings: WeekStandings[];
}

declare interface ISeason extends Document {
  SeasonCode: string;
  Title: string;
  Competition?: any; // ObjectId reference
  CompetitionCode: string;
  Winner?: any; // ObjectId reference
  Promoted: any[]; // Array of ObjectIds
  Relegated: any[]; // Array of ObjectIds
  isFinished: boolean;
  isStarted: boolean;
  Status: string;
  StartDate: Date;
  EndDate: Date;
  Year?: string;
  Calendar?: any; // ObjectId reference
  Fixtures: any[]; // Array of ObjectIds
  Standings: WeekStandings[];
  Logs?: any[];
  // Timestamps from mongoose
  createdAt: Date;
  updatedAt: Date;
}

export interface ClubStandings {
  ClubCode: string;
  ClubID: string;
  Points: number;
  Played: number;
  Wins: number;
  Losses: number;
  Draws: number;
  GF: number;
  GA: number;
  GD: number;
}

interface WeekStandings {
  Week: number;
  Table: ClubStandings[];
}

export type SeasonModel = Model<ISeason>;

const Log: Schema = new Schema({
  title: String,
  content: String,
  date: Date,
});

const WeekStandingsSchema: Schema = new Schema({
  Week: Number,
  Table: [
    {
      ClubCode: String,
      ClubID: String,
      Points: Number,
      Played: Number,
      Wins: Number,
      Losses: Number,
      Draws: Number,
      GF: Number,
      GA: Number,
      GD: Number,
    },
  ],
});

export class Season {
  private _model: Model<ISeason>;

  constructor() {
    // Check if model already exists to prevent OverwriteModelError
    try {
      this._model = model<ISeason>('Season');
    } catch (error) {
      // Model doesn't exist, create it
      const SeasonSchema: Schema = new Schema(
        {
          SeasonCode: { type: String, unique: true },
          Title: { type: String },
          StartDate: { type: Date },
          EndDate: { type: Date },
          Winner: { type: Schema.Types.ObjectId, ref: 'Club' },
          Promoted: [{ type: Schema.Types.ObjectId, ref: 'Club' }],
          Relegated: [{ type: Schema.Types.ObjectId, ref: 'Club' }],
          isFinished: { type: Boolean, default: false },
          isStarted: { type: Boolean, default: false },
          Status: { type: String, default: 'Pending' },
          Year: String,
          Calendar: { type: Schema.Types.ObjectId, ref: 'Calendar' },
          Competition: { type: Schema.Types.ObjectId, ref: 'Competition' },
          CompetitionCode: { type: String },
          Fixtures: [{ type: Schema.Types.ObjectId, ref: 'Fixture' }],
          Standings: [WeekStandingsSchema],
          Logs: [Log],
        },
        { timestamps: true }
      );

      // Post-remove hook commented out to prevent circular dependency with DB
      // If needed, handle cleanup in the controller/service layer instead
      // SeasonSchema.post('remove', async function(this: ISeason & Document, doc, next) {
      //   await DB.Models.Fixture.deleteMany({ Season: this._id });
      //   await DB.Models.Competition.updateOne(
      //     { Seasons : this._id},
      //     { $pull: { Seasons: this._id } },
      //     { multi: true })
      //     .exec();
      //   next();
      // });

      this._model = model<ISeason>('Season', SeasonSchema, 'Seasons');
    }
  }

  public get model() {
    return this._model;
  }
}
