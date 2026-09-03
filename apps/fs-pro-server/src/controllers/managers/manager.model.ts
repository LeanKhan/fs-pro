export interface ManagerInterface {
  _id?: string;
  Key: string;
  FirstName: string;
  LastName: string;
  Age: number;
  Picture: string;
  ClubId?: string;
  /** Narrowed to `_id`/`Name`/`ClubCode`/`LeagueCode` when populated - see
   * IManagerReadOptions.withClub. */
  Club?: { _id: string; Name: string; ClubCode: string; LeagueCode: string };
  NationalTeam?: boolean;
  NationalityId?: string;
  Nationality?: import('../places/places.model').IPlace;
  Records: [];
  isEmployed: boolean;
  /** Default tactic used at kickoff when this manager's club plays -
   * see state/PersistentState/Formations.ts for valid names. */
  PreferredFormation?: string;
  PreferredStyle?: string;
}
