import { Club } from './club';
import { Season } from './season';

export interface Competition {
  _id: string | undefined;
  Type: string;
  Name: string;
  CompetitionID: string | undefined;
  CompetitionCode: string;
  Country: any;
  League: boolean;
  Tournament: boolean;
  Cup: boolean;
  NumberOfTeams: number | string;
  NumberOfWeeks: number | string;
  Clubs: Club[] | string[];
  Seasons: Season[] | string[];
}
