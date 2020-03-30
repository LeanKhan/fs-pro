import { Club } from './club';
import { Season } from './season';

export interface Competition {
  Type: string;
  Name: string;
  CompetitionID: string;
  CompetitionCode: string;
  League: boolean;
  Tournament: boolean;
  Cup: boolean;
  NumberOfTeams: number;
  NumberOfWeeks: number;
  Clubs: Club[];
  Seasons: Season[];
}
