import { PlayerStats } from './player';

export interface Season {
  SeasonID: string;
  SeasonCode: string;
  SeasonTitle: string;
  Competition: string;
  CompetitionCode: string;
  Fixtures: [];
  Standings: [];
  PlayerStats: PlayerSeasonStats[];
}

export interface PlayerSeasonStats extends PlayerStats {
  PlayerID: string;
  Player: string;
  MOTM: number;
}
