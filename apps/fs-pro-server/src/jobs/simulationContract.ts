import { IClub } from '../interfaces/Club';
import { ITactic } from '../simulation/state/PersistentState/Formations';
import { IMatchDetails, IMatchEvent } from '../simulation/classes/Match';
import { MatchFrames } from '../realtime/packedFrames';
import { IReplayableMatch } from '../realtime/matchBroadcaster';

/**
 * Milestone 9 (Engine Contract And Resource Controls) - the "one stable
 * internal interface" the tracker asks for. Finalizes, rather than
 * invents, the shape `matchSimWorker.ts`/`matchQueue.ts` already implied
 * with their ad hoc `IMatchSimWorkerData`/`{ok,result}` types - this is
 * that same shape, named and shared, plus lightweight metrics.
 *
 * `clubs` is already plain JSON (Mongoose/BSON stripped) by the time a
 * request is built - see buildSimulateMatchRequest.ts - since this
 * crosses a worker_thread boundary (structured clone, not every
 * Mongoose-lean() field survives that).
 */
export interface SimulateMatchRequest {
  fixtureId: string;
  clubs: IClub[];
  sides: { home: string; away: string };
  tactics: { home: ITactic; away: ITactic };
  fixtureType?: string;
  stage?: string;
  isKnockout?: boolean;
  /** Seeds every random draw of this run (engine, QuickSim, penalty
   * shootout). buildSimulateMatchRequest() makes a fresh one per run, so
   * playing the same fixture again is a new match; passing a recorded seed
   * reproduces that exact run (tests, bug reports). */
  seed: string;
}

/** The seed a match actually runs with - see `SimulateMatchRequest.seed`. */
export const matchSeedFor = (request: Pick<SimulateMatchRequest, 'seed'>): string => request.seed;

/**
 * Everything `simulateMatch()` reads or produces off a finished match,
 * beyond the leaner `IReplayableMatch` (Frames/Details only, used for
 * replay streaming/storage) - adds `Events` (needed to persist the
 * fixture's result) and `ManagerId` (needed to build the home/away
 * summary objects `updateFixture` expects).
 */
export interface SimulatedMatchData extends IReplayableMatch {
  Home: IReplayableMatch['Home'] & { ManagerId: string };
  Away: IReplayableMatch['Away'] & { ManagerId: string };
  /** Packed for transport/storage - see realtime/packedFrames.ts. */
  Frames: MatchFrames;
  Details: IMatchDetails;
  Events: IMatchEvent[];
}

export interface SimulationMetrics {
  queuedAt: number;
  startedAt: number;
  finishedAt: number;
  queueWaitMs: number;
  simulationMs: number;
  totalMs: number;
}

export type SimulateMatchResult =
  | {
      ok: true;
      fixtureId: string;
      match: SimulatedMatchData;
      metrics: SimulationMetrics;
    }
  | {
      ok: false;
      fixtureId: string;
      error: string;
      stack?: string;
      metrics: SimulationMetrics;
    };
