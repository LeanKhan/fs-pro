import { PlayerInterface } from './Player';
export interface IClub {
  _id?: string;
  Name: string;
  /** Club's overall Attacking rating */
  AttackingClass: number;
  /** Club's overall Defensive rating */
  DefensiveClass: number;
  /** Players */
  Players: PlayerInterface[];
  Rating: number;
  Address: Record<string, unknown>;
  ClubCode: string;
  ManagerId?: string;
  Manager?: import('../controllers/managers/manager.model').ManagerInterface;
  Stadium: Record<string, unknown>;
  Stats: Record<string, unknown>;
  LeagueId?: string;
  LeagueCode?: string;
}
