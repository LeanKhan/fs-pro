import { Player } from './player';

export interface Club {
  _id: string;
  Name: string;
  ClubCode: string;
  LeagueCode: string;
  League: string;
  AttackingClass: number;
  DefensiveClass: number;
  Players: Player[];
  assets: {
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
  Stadium: {
    Name: string;
    Capacity: string;
    YearOccupied: string;
    Location: string;
  };
  Stats: {
    LeagueTitles: number;
    Cups: number;
    MatchesWon: number;
    MatchesLost: number;
    MatchesDrawn: number;
  };
  Address: {
    Section: string;
    City: string;
    Country: string;
  };
  Budget: number;
  Transactions: {};
}
