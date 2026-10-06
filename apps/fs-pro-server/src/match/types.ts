/**
 * The shape of a played match, as the sim service (crates/sim-core,
 * contract.rs) returns it and the rest of the server stores, streams and
 * reports on it. The engine itself lives in Rust; these are just its
 * results.
 */
import type { PlayerMatchDetailsInterface } from '../controllers/player-match/player-match.model';

export type PlayerMatchStatus = 'active' | 'sent-off' | 'substituted';

export interface IMatchEvent {
  type:
    | 'match'
    | 'shot'
    | 'miss'
    | 'save'
    | 'goal'
    | 'dribble'
    | 'tackle'
    | 'pass'
    | 'interception'
    | 'foul'
    | 'substitution';
  message: string;
  /** Match minute, as a string ("1".."90"). */
  time?: string;
  playerID?: string;
  /** The acting player's club CODE (not id). */
  playerTeamID?: string;
  /** Per type - goal: { xG, penalty, assistID }; save: { xG, penalty,
   * shooterID }; miss: { xG, penalty, blocked }; foul: { card, penalty }. */
  data?: any;
}

/** Replay frames - shared with the client (packages/api-contract
 * replay.ts): one engine tick (~7.5 s) per frame, stored and transported
 * packed. */
export type { MatchFrame as IMatchFrame, MatchFramePlayer as IMatchFramePlayer } from '@repo/api-contract';

export interface IMatchSideDetails {
  ClubId: string;
  FixtureId?: string;
  TimesWithBall: number;
  Possession: number;
  Goals: number;
  TotalShots: number;
  ShotsOnTarget: number;
  ShotsOffTarget: number;
  Fouls: number;
  YellowCards: number;
  RedCards: number;
  Passes: number;
  /** Sum of the side's shot xG. */
  XG?: number;
  Events: IMatchEvent[];
  PlayerStats: PlayerMatchDetailsInterface[] | string[];
  Won: boolean;
  Drew: boolean;
  [key: string]: any;
}

export interface IMatchDetails {
  Title: string;
  LeagueName: string;
  Draw: boolean;
  Played: boolean;
  Time?: Date;
  FirstHalfScore: string;
  FullTimeScore: string;
  HomeTeamScore: number;
  AwayTeamScore: number;
  Winner: { code: string; id: string } | null;
  Loser: { code: string; id: string } | null;
  MOTM: any;
  TotalPasses: number;
  Goals: number;
  HomeTeamDetails: IMatchSideDetails;
  AwayTeamDetails: IMatchSideDetails;
  Penalties?: {
    Home: number;
    Away: number;
    Winner: string;
  };
}
