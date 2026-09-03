import { ClubInterface } from '../clubs/club.model';

export interface CompetitionInterface {
  _id?: string;
  Type: string;
  Name: string;
  CompetitionID: string;
  CompetitionCode: string;
  CountryId?: string;
  Country?: import('../places/places.model').IPlace;
  League: boolean;
  Tournament: boolean;
  Cup: boolean;
  Division: 1 | 2 | 3 | 0;
  NumberOfTeams: number;
  NumberOfWeeks: number;
  TeamsRelegated?: number;
  TeamsPromoted?: number;
  Clubs: ClubInterface[] | string[];
  Seasons: [];
}
