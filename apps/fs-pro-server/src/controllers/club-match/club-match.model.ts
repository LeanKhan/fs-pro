import { Fixture } from '../fixtures/fixture.model';
import { IClub } from '../../interfaces/Club';
import { PlayerMatchDetailsInterface } from '../player-match/player-match.model';
import { IMatchEvent } from '../../classes/Match';

export interface ClubMatchDetailsInterface {
  _id?: string;
  Club: string | IClub;
  Fixture: string | Fixture;
  TimesWithBall: number;
  Possession: number;
  Goals: number;
  ShotsOnTarget: number;
  ShotsOffTarget: number;
  Fouls: number;
  YellowCards: number;
  RedCards: number;
  Passes: number;
  PlayerStats: string[] | PlayerMatchDetailsInterface[];
  Won: boolean;
  Drew: boolean;
  Events: IMatchEvent[];
}
