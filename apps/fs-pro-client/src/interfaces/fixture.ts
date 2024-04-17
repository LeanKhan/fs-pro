/* eslint-disable @typescript-eslint/interface-name-prefix */
export interface IFixture {
  _id: string;
  Title: string;
  FixtureID: string;
  SeasonCode: string;
  LeagueCode: string;
  Season: string;
  Played: boolean;
  MatchDate: string;
  PlayedAt: Date;
  Week: number;
  Home: string;
  Away: string;
  HomeTeam: string; // actually this is the Club _id or object
  AwayTeam: string; // as HomeTeam
  Stadium: string;
  Type: 'league' | 'cup' | 'tournament' | 'friendly';
  Status: 'friendly' | 'first-leg' | 'second-leg' | 'regular';
  ReverseFixture: string;
  Details: IMatchDetails;
  HomeSideDetails: IMatchSideDetails;
  AwaySideDetails: IMatchSideDetails;
  Events: IMatchEvent[];
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

interface IMatchAction {
  type: 'pass' | 'goal';
  playerID: string;
  playerTeam: string;
  timestamp: number;
}
