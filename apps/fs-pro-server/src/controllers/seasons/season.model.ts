import { CompetitionInterface } from '../competitions/competition.model';
import { Fixture } from '../fixtures/fixture.model';

export interface SeasonInterface {
  _id?: string;
  SeasonCode: string;
  Title: string;
  Competition: string | CompetitionInterface;
  CompetitionCode: string;
  Winner: string;
  Promoted: string[];
  Relegated: string[];
  isFinished: boolean;
  isStarted: boolean;
  Status: string;
  StartDate: Date;
  EndDate: Date;
  Year: string;
  Fixtures: Fixture[];
  Standings: WeekStandings[];
  Logs?: Record<string, unknown>[];
}

export interface ClubStandings {
  ClubCode: string;
  ClubID: string;
  Points: number;
  Played: number;
  Wins: number;
  Losses: number;
  Draws: number;
  GF: number;
  GA: number;
  GD: number;
}

interface WeekStandings {
  Week: number;
  Table: ClubStandings[];
}
