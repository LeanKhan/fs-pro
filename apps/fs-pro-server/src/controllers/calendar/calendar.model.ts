// import DB from '../../db'; // Removed to prevent circular dependency
import { Schema, Document, model, Model } from 'mongoose';

export interface CalendarInterface {
  _id?: string;
  Name: string;
  /** Like JUN-2020 */
  YearString: string;
  /** Like 06-2020 */
  YearDigits: string;
  /** The present day of the year */
  CurrentDay?: number;
  /** If the Calendar is the active one */
  isActive: boolean;
  /** See if Calendar has been ended pata pata */
  isEnded: boolean;
  /** Are all Seasons completed? */
  allSeasonsCompleted: boolean;
  /** Array of the ids of Days */
  Days: string[];
}

declare interface ICalendar extends Document {
  Name: string;
  /** Like JUN-2020 */
  YearString: string;
  /** Like 06-2020 */
  YearDigits: string;
  /** The present day of the year */
  CurrentDay?: number;
  /** If the Calendar is the active one */
  isActive: boolean;
  /** See if Calendar has been ended pata pata */
  isEnded: boolean;
  /** Are all Seasons completed? */
  allSeasonsCompleted: boolean;
  /** Array of the ids of Days */
  Days: any[]; // Array of ObjectIds
  // Timestamps from mongoose
  createdAt: Date;
  updatedAt: Date;
}

export type CalendarModel = Model<ICalendar>;

export class Calendar {
  private _model: Model<ICalendar>;

  constructor() {
    // Check if model already exists to prevent OverwriteModelError
    try {
      this._model = model<ICalendar>('Calendar');
    } catch (error) {
      // Model doesn't exist, create it
      const CalendarSchema: Schema = new Schema(
        {
          Name: String,
          YearString: String,
          YearDigits: String,
          CurrentDay: Number, // the index of the day...
          isActive: { type: Boolean, default: false },
          isEnded: { type: Boolean, default: false },
          allSeasonsCompleted: { type: Boolean, default: false },
          Days: [{ type: Schema.Types.ObjectId, ref: 'Day' }],
        },
        { timestamps: true }
      );

      // Post-remove hook commented out to prevent circular dependency with DB
      // If needed, handle cleanup in the controller/service layer instead
      // CalendarSchema.post('remove', async function(this: ICalendar & Document, doc, next) {
      //   await DB.Models.Day.deleteMany({ Calendar: this._id });
      //   await DB.Models.Season.deleteMany({ Calendar: this._id });
      //   next();
      // });

      this._model = model<ICalendar>('Calendar', CalendarSchema, 'Calendars');
    }
  }

  public get model() {
    return this._model;
  }
}
