import { Club } from './club';
import { Season } from './season';
import { Place } from './place';

export interface Competition {
  _id: string | undefined;
  Type: string;
  Name: string;
  CompetitionID: string | undefined;
  CompetitionCode: string;
  /** Bare id from the edit-form route (`?populate=false`); a full Place
   * object otherwise. */
  CountryId?: string;
  Country?: Place;
  League: boolean;
  Tournament: boolean;
  Cup: boolean;
  NumberOfTeams: number | string;
  NumberOfWeeks: number | string;
  Clubs: Club[] | string[];
  Seasons: Season[] | string[];
}
