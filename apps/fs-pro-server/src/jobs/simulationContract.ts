import { IClub } from '../interfaces/Club';
import { ITactic } from '../match/tactics';
import { IMatchDetails, IMatchEvent } from '../match/types';
import { MatchFrames } from '../realtime/packedFrames';
import { IReplayableMatch } from '../realtime/matchBroadcaster';

/**
 * The request/result of one match on the sim service (crates/sim-core
 * contract.rs - keep in step). `clubs` is plain JSON (whole squads; the
 * engine picks the XI), see buildSimulateMatchRequest.ts.
 */
export interface SimulateMatchRequest {
  fixtureId: string;
  clubs: IClub[];
  sides: { home: string; away: string };
  tactics: { home: ITactic; away: ITactic };
  fixtureType?: string;
  stage?: string;
  isKnockout?: boolean;
  /** Seeds every random draw of this run (the engine and the penalty
   * shootout). buildSimulateMatchRequest() makes a fresh one per run, so
   * playing the same fixture again is a new match; passing a recorded seed
   * reproduces that exact run (tests, bug reports). */
  seed: string;
  /** Record replay frames (default true). False for matches nobody will
   * watch - the engine runs the same, the response is ~25 KB not ~165 KB. */
  includeFrames?: boolean;
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
