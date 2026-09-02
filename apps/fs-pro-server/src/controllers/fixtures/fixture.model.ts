import {
  IMatchDetails,
  IMatchEvent,
  IMatchSideDetails,
} from '../../classes/Match';
import { ClubInterface } from '../clubs/club.model';
import { ITactic } from '../../state/PersistentState/Formations';

export interface Fixture {
  _id: string;
  Title: string;
  FixtureID: string;
  SeasonCode: string;
  LeagueCode: string;
  Season: string;
  Played: boolean;
  PlayedAt: Date;
  Week: number;
  Home: string;
  Away: string;
  HomeTeam: string | ClubInterface;
  AwayTeam: string | ClubInterface;
  Stadium: string;
  Type: 'league' | 'cup' | 'tournament' | 'friendly';
  Status: 'friendly' | 'first-leg' | 'second-leg' | 'regular';
  Tie: string;
  Stage: string;
  ReverseFixture: string;
  Details: IMatchDetails;
  HomeSideDetails: IMatchSideDetails;
  AwaySideDetails: IMatchSideDetails;
  Events: IMatchEvent[];
  HomeManager: string;
  AwayManager: string;
  isFinalMatch: boolean;
  /** Explicit per-match tactic override - set only for friendlies created
   * via POST /api/game/friendly. Absent for season fixtures, which always
   * resolve tactics from each club's Manager instead (see Game.controller's
   * play()). */
  HomeTactic?: ITactic;
  AwayTactic?: ITactic;
  /** Whether this match's result should count toward permanent player/club
   * stats history. Only meaningful for friendlies - real fixtures are
   * always persisted in full regardless of this field. */
  SaveStats?: boolean;
  /** The absolute day (Calendar.CurrentDay units) this fixture is scheduled
   * to play on - nullable for friendlies/unscheduled fixtures. */
  ScheduledDay?: number | null;
  ScheduledDate?: Date | null;
}
