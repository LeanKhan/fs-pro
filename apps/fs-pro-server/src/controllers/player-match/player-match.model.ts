import { PlayerInterface } from '../../interfaces/Player';
import { Fixture } from '../fixtures/fixture.model';

export interface PlayerMatchDetailsInterface {
  _id?: string;
  Player?: string | PlayerInterface;
  Fixture?: string | Fixture;
  Goals: number;
  Saves: number;
  YellowCards: number;
  Fouls: number;
  RedCards: number;
  Passes: number;
  Tackles: number;
  Assists: number;
  CleanSheets: number;
  Points: number;
  Dribbles: number;
  Interceptions: number;
  Form?: number;
  [key: string]: any;
}
