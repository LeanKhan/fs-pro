export interface IUser {
  _id?: string;
  FullName: string;
  Age?: number;
  Username: string;
  Avatar: string;
  Alerts?: any;
  Password: string;
  Clubs: any[];
  isAdmin: boolean;
  /** The Session ID associated with this user */
  Session: string;
}
