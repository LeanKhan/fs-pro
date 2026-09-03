import { Place } from './place';

/** Narrowed to `_id`/`Name`/`ClubCode`/`LeagueCode` when populated as the
 * `Manager` on a fetched Club - see the server's `IManagerReadOptions`. */
export interface ManagerClubRef {
  _id: string;
  Name: string;
  ClubCode: string;
  LeagueCode: string;
}

export interface Manager {
  _id: string;
  Key: string;
  FirstName: string;
  LastName: string;
  Age: number;
  Picture: string | null;
  ClubId?: string;
  Club?: ManagerClubRef;
  NationalTeam?: boolean;
  NationalityId?: string;
  Nationality?: Place;
  Records: unknown[];
  isEmployed: boolean;
  /** Default tactic used at kickoff when this manager's club plays. */
  PreferredFormation?: string;
  PreferredStyle?: string;
}
