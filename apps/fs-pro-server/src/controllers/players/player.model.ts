import { IPlayerAttributes } from '../../interfaces/Player';

export interface PlayerInterface {
  /** Name of the Player! */
  _id?: string;
  FirstName: string;
  LastName: string;
  Age: number;
  PlayerID: string;
  /** overall Player rating */
  Rating: number;
  /** Goals scored in total */
  GoalsScored: number;
  ShirtNumber: string;
  Position: string;
  /** Collecting of Player's attributes */
  Role: Role;
  Attributes: IPlayerAttributes;
  isSigned: boolean;
  /** Monetary value of Player */
  Value: number;
  /** Some Players don't have clubs (free agents) hence can be undefined */
  ClubCode?: string;
  Club?: string;
  RatingsHistory?: Record<string, unknown>[];
}

export const roles = [
  'LW',
  'RW',
  'ST',
  'LB',
  'RB',
  'CB',
  'CM',
  'CAM',
  'CDM',
  'RM',
  'LM',
  'GK',
] as const;

export type Role = typeof roles[number];

export const Roles = {
  ATT: ['LW', 'RW', 'ST'],
  DEF: ['LB', 'RB', 'CB'],
  MID: ['CM', 'CAM', 'CDM', 'RM', 'LM'],
  GK: ['GK'],
};
