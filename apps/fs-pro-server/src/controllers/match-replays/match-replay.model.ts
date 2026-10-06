import { IMatchDetails } from '../../match/types';
import { MatchFrames } from '../../realtime/packedFrames';

interface ISideRef {
  id: string;
  name: string;
  code: string;
}

/**
 * One saved record per Fixture holding the exact per-tick frames
 * `Match.captureFrame()` recorded during simulation - the same shape
 * `realtime/matchBroadcaster.ts` streams live at kickoff - so a finished
 * match can be re-streamed on demand later without re-simulating it.
 * Kept as its own table rather than a field on Fixture (see
 * fixture.model.ts) since Frames arrays are large per-tick snapshots that
 * every ordinary fixture list/lookup query would otherwise drag along.
 */
export interface MatchReplayRecord {
  _id: string;
  FixtureId: string;
  Home: ISideRef;
  Away: ISideRef;
  /** Packed for replays saved since packing; a plain array for older ones. */
  Frames: MatchFrames;
  Details: IMatchDetails;
  TickMs: number;
}
