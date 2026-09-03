import { Player } from './player';
import { ManagerClubRef } from './manager';
import { Place } from './place';

export interface Club {
  _id: string;
  Name: string;
  ClubCode: string;
  LeagueCode: string;
  LeagueId?: string;
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
  ManagerId?: string;
  Manager?: ManagerClubRef;
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
  /** `Country` here is legacy/unused - the FK lives in AddressCountryId,
   * and the populated Place (when requested) surfaces under the separate
   * top-level AddressCountry field below, not nested here. */
  Address: {
    Section: string;
    City: string;
    Country: string;
  };
  AddressCountryId?: string;
  AddressCountry?: Place;
  Budget: number;
  Transactions: object;
}
