import { Schema, Document, model, Model } from 'mongoose';
import { IMatchDetails, IMatchFrame } from '../../classes/Match';

interface ISideRef {
  id: string;
  name: string;
  code: string;
}

export interface MatchReplayRecord {
  _id: string;
  Fixture: string;
  Home: ISideRef;
  Away: ISideRef;
  Frames: IMatchFrame[];
  Details: IMatchDetails;
  TickMs: number;
}

declare interface IMatchReplay extends Document {
  Fixture: string;
  Home: ISideRef;
  Away: ISideRef;
  Frames: IMatchFrame[];
  Details: IMatchDetails;
  TickMs: number;
}

export type MatchReplayModel = Model<IMatchReplay>;

/**
 * One saved record per Fixture holding the exact per-tick frames
 * `Match.captureFrame()` recorded during simulation - the same shape
 * `realtime/matchBroadcaster.ts` streams live at kickoff - so a finished
 * match can be re-streamed on demand later without re-simulating it.
 * Kept as its own collection rather than a field on Fixture (see
 * fixture.model.ts) since Frames arrays are large per-tick snapshots that
 * every ordinary fixture list/lookup query would otherwise drag along.
 */
export class MatchReplay {
  private _model: Model<IMatchReplay>;

  constructor() {
    const MatchReplaySchema: Schema = new Schema(
      {
        Fixture: {
          type: Schema.Types.ObjectId,
          ref: 'Fixture',
          unique: true,
          required: true,
        },
        Home: { type: Schema.Types.Mixed },
        Away: { type: Schema.Types.Mixed },
        Frames: { type: Schema.Types.Mixed },
        Details: { type: Schema.Types.Mixed },
        TickMs: Number,
      },
      { timestamps: true }
    );

    this._model = model<IMatchReplay>(
      'MatchReplay',
      MatchReplaySchema,
      'MatchReplays'
    );
  }

  public get model() {
    return this._model;
  }
}
