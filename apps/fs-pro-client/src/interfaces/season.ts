import { PlayerStats } from './player';

export interface Season {
  SeasonID: string;
  SeasonCode: string;
  Title: string;
  Competition: string;
  CompetitionCode: string;
  Winner: string;
  isFinished: boolean;
  isStarted: boolean;
  Status: string;
  StartDate: Date;
  EndDate: Date;
  Fixtures: [];
  Standings: WeekStandings[];
  PlayerStats: PlayerSeasonStats[];
}

export interface PlayerSeasonStats extends PlayerStats {
  PlayerID: string;
  Player: string;
  MOTM: number;
}

export interface WeekStandings {
  _id: string;
  Week: number;
  Table: ClubStandings[];
}

export interface ClubStandings {
  ClubCode: string;
  Points: number;
  Played: number;
  Wins: number;
  Losses: number;
  Draws: number;
  GF: number;
  GA: number;
  GD: number;
}
