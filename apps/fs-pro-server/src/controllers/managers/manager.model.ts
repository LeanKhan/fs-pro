import { Schema, Document, Model, model } from 'mongoose';
import DB from '../../db';

export interface ManagerInterface {
  _id?: string;
  Key: string;
  FirstName: string;
  LastName: string;
  Age: number;
  Picture: string;
  Club: string;
  NationalTeam?: boolean;
  Nationality: string;
  Records: [];
  isEmployed: boolean;
}

/**
 * Records like
 * 'Manager of the year: 2020 season'
 */

declare interface IManager extends Document {
  Key: string;
  FirstName: string;
  LastName: string;
  Age: number;
  Picture?: string;
  Club?: any; // ObjectId reference
  NationalTeam?: boolean;
  Nationality?: any; // ObjectId reference
  Records: any[];
  isEmployed: boolean;
  // Timestamps from mongoose
  createdAt: Date;
  updatedAt: Date;
}

export type ManagerModel = Model<IManager>;

export class Manager {
  private _model: Model<IManager>;

  constructor() {
    // Check if model already exists to prevent OverwriteModelError
    try {
      this._model = model<IManager>('Manager');
    } catch (error) {
      // Model doesn't exist, create it
      const ManagerSchema: Schema = new Schema(
        {
          Key: {
            type: String,
            unique: true,
          },
          FirstName: {
            type: String,
            required: true,
          },
          LastName: {
            type: String,
            required: true,
          },
          Age: {
            type: Number,
          },
          Picture: {
            type: String,
          },
          Club: { type: Schema.Types.ObjectId, ref: 'Club' },
          Nationality: { type: Schema.Types.ObjectId, ref: 'Place' },
          NationalTeam: {
            type: Boolean,
            default: false,
          },
          Records: [],
          isEmployed: {type: Boolean, default: false},
        },
        { timestamps: true }
      );

      const populate = function (this: IManager & Document, next: any) {
        this.populate('Nationality');
        next();
      };

      ManagerSchema.pre('find', populate).pre('findOne', populate);

//  No need for this, since we are already removing Manager
// from Club in the router/controller.

      // ManagerSchema.post('remove', async function(doc, next) {

      //     await DB.Models.Club.updateOne(
      //     { Manager : this._id},
      //     { $unset: { Manager: 1 }},
      //     { multi: true })  //if reference exists in multiple documents
      //     .exec();

      //     next();
      //   });

      this._model = model<IManager>('Manager', ManagerSchema, 'Managers');
    }
  }

  public get model() {
    return this._model;
  }
}
