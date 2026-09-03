import { PlayerInterface } from '../../interfaces/Player';
import { IUser } from '../user/user.model';

export interface ClubInterface {
  _id?: string;
  Name: string;
  ClubCode: string;
  LeagueCode?: string;
  LeagueId?: string;
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
  ManagerId?: string;
  Manager?: import('../managers/manager.model').ManagerInterface;
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
  /** `Country` here is legacy/unused going forward - never mutated in
   * place. The FK lives in AddressCountryId, and the populated Place (when
   * requested) surfaces under the separate top-level AddressCountry field
   * below, not nested here. */
  Address?: {
    Section: string;
    City: string;
    Country: string;
  };
  AddressCountryId?: string;
  AddressCountry?: import('../places/places.model').IPlace;
  UserId?: string;
  User?: IUser;
  Budget?: number;
  Transactions?: unknown; // TODO: fix, use an actual type :)
  Records?: any[];
}
