// import DB from '../../db'; // Removed to prevent circular dependency
import { Schema, Document, Model, model } from 'mongoose';

export interface CalendarMatchInterface {
  Fixture: string;
  MatchType: string;
  Time: string;
  FixtureIndex: number;
  Competition: string;
  CompetitionId: string;
  Played: boolean;
  Week: number;
}

export interface DayInterface {
  Matches: CalendarMatchInterface[];
  isFree: boolean;
  Day?: number;
  Year?: string;
  Calendar?: string;
}

declare interface IDay extends Document {
  Matches: CalendarMatchInterface[];
  isFree: boolean;
  Day?: number;
  Year: string;
  Calendar?: any; // ObjectId reference
  // Timestamps from mongoose
  createdAt: Date;
  updatedAt: Date;
}

const CalendarMatchSchema: Schema = new Schema({
  Fixture: { type: Schema.Types.ObjectId, ref: 'Fixture' },
  MatchType: String,
  Time: String,
  Competition: String,
  FixtureIndex: Number,
  CompetitionId: { type: Schema.Types.ObjectId, ref: 'Competition' },
  Played: Boolean,
  Week: Number,
});

export type DayModel = Model<IDay>;

export class Day {
  private _model: Model<IDay>;

  constructor() {
    // Check if model already exists to prevent OverwriteModelError
    try {
      this._model = model<IDay>('Day');
    } catch (error) {
      // Model doesn't exist, create it
      const DaySchema: Schema = new Schema(
        {
          Matches: [CalendarMatchSchema],
          isFree: Boolean,
          Day: Number,
          Year: String,
          Calendar: { type: Schema.Types.ObjectId, ref: 'Calendar' },
        },
        { timestamps: true }
      );

      // Post-remove hook commented out to prevent circular dependency with DB
      // If needed, handle cleanup in the controller/service layer instead
      // DaySchema.post('remove', async function(this: IDay & Document, next) {
      //   await DB.Models.Calendar.updateOne(
      //       { Days : this._id},
      //       { $pull: { Days: this._id } },
      //       { multi: true })
      //   .exec();
      //   next();
      // });

      this._model = model<IDay>('Day', DaySchema, 'Days');
    }
  }

  public get model() {
    return this._model;
  }
}
