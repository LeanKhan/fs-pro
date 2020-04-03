import { PlayerStats } from './player';

export interface Season {
  SeasonID: string;
  SeasonCode: string;
  SeasonTitle: string;
  Competition: string;
  Winner: string;
  isFinished: boolean;
  isStarted: boolean;
  CompetitionCode: string;
  EndDate: string;
  StartDate: string;
  Fixtures: [];
  Standings: [];
  PlayerStats: PlayerSeasonStats[];
}

export interface PlayerSeasonStats extends PlayerStats {
  PlayerID: string;
  Player: string;
  MOTM: number;
}
