export interface ManagerInterface {
  _id?: string;
  Key: string;
  FirstName: string;
  LastName: string;
  Age: number;
  Picture: string;
  Club: string;
  NationalTeam?: boolean;
  Nationality: string;
  Records: [];
  isEmployed: boolean;
  /** Default tactic used at kickoff when this manager's club plays -
   * see state/PersistentState/Formations.ts for valid names. */
  PreferredFormation?: string;
  PreferredStyle?: string;
}
