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
  /** Set once by yearly age-based retirement - see
   * controllers/players/player-lifecycle.service.ts. */
  isRetired?: boolean;
  /** Manager-chosen yearly training focus - one of TRAINING_CATEGORIES
   * (player-training.service.ts). Null/unset means "no explicit choice,
   * use the Position-based auto-default" - NOT "no training". */
  TrainingFocus?: string | null;
  /** Monetary value of Player */
  Value: number;
  /** Annual wage, deducted from the owning Club's Budget once per game Year. */
  Wage?: number;
  /** Some Players don't have clubs (free agents) hence can be undefined */
  ClubCode?: string;
  ClubId?: string;
  NationalityId?: string;
  Nationality?: import('../places/places.model').IPlace;
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

export type Role = (typeof roles)[number];

export const Roles = {
  ATT: ['LW', 'RW', 'ST'],
  DEF: ['LB', 'RB', 'CB'],
  MID: ['CM', 'CAM', 'CDM', 'RM', 'LM'],
  GK: ['GK'],
};
