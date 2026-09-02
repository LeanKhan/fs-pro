import { PlayerInterface } from '../../interfaces/Player';
import { IUser } from '../user/user.model';

export interface ClubInterface {
  _id?: string;
  Name: string;
  ClubCode: string;
  LeagueCode?: string;
  League?: string;
  AttackingClass: number;
  DefensiveClass: number;
  Players: PlayerInterface[];
  assets?: {
    Kit: string;
    Logo: string;
    Stadium: string;
  };
  Rating: number;
  GK_Rating: number;
  ATT_Rating: number;
  DEF_Rating: number;
  MID_Rating: number;
  Manager: string;
  Stadium?: {
    Name: string;
    Capacity: string;
    YearOccupied: string;
    Location: string;
  };
  Stats?: {
    LeagueTitles: number;
    Cups: number;
    MatchesWon: number;
    MatchesLost: number;
    MatchesDrawn: number;
  };
  Address?: {
    Section: string;
    City: string;
    Country: string;
  };
  User?: string | IUser;
  Budget?: number;
  Transactions?: unknown; // TODO: fix, use an actual type :)
  Records?: any[];
}
