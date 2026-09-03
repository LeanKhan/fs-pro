/* eslint-disable @typescript-eslint/interface-name-prefix */
import { Club } from './club';

export interface IFixture {
  _id: string;
  Title: string;
  FixtureID: string;
  SeasonCode: string;
  LeagueCode: string;
  SeasonId: string;
  Played: boolean;
  MatchDate: string;
  PlayedAt: Date;
  Week: number;
  Home: string;
  Away: string;
  /** Bare Club id from list/engine routes; a full Club object (Name,
   * Rating, Players) only when fetched via `GET /fixtures/:id` (Matchzone
   * - see the server's `withClub` fixture-read option). */
  HomeTeamId: string;
  HomeTeam?: Club;
  AwayTeamId: string;
  AwayTeam?: Club;
  Stadium: string;
  Type: 'league' | 'cup' | 'tournament' | 'friendly';
  Status: 'friendly' | 'first-leg' | 'second-leg' | 'regular';
  ReverseFixtureId: string;
  Details: IMatchDetails;
  /** Populated on every fetch (server-side baseline, not opt-in). */
  HomeSideDetails: IMatchSideDetails;
  AwaySideDetails: IMatchSideDetails;
  Events: IMatchEvent[];
  /** The absolute Calendar day this fixture is scheduled to play on -
   * nullable for friendlies/unscheduled fixtures. */
  ScheduledDay?: number | null;
  ScheduledDate?: string | null;
}

export interface IMatchEvent {
  type: 'match' | 'shot' | 'miss' | 'save' | 'goal' | 'dribble' | 'tackle';
  message: string;
  time?: string;
  playerID?: string;
  data?: any;
}

export interface IMatchDetails {
  Title: string;
  LeagueName: string;
  Draw: boolean;
  Played: boolean;
  Time: Date;
  FirstHalfScore: string;
  FullTimeScore: string;
  HomeTeamScore: number;
  AwayTeamScore: number;
  Winner: string | null;
  Loser: string | null;
  MOTM: any;
  TotalPasses: number;
  Goals: number;
  HomeTeamDetails: IMatchSideDetails;
  AwayTeamDetails: IMatchSideDetails;
}

export interface IMatchSideDetails {
  Score: number;
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
  Events: IMatchEvent[];
  [key: string]: any;
}

export interface IMatchAction {
  type: 'pass' | 'goal';
  playerID: string;
  playerTeam: string;
  timestamp: number;
}
