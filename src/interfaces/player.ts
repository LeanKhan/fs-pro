export interface PlayerAttributes {
  Speed: number;
  Shooting: number;
  LongPass: number;
  ShortPass: number;
  Mental: number;
  Tackling: number;
  Keeping: number;
  Control: number;
  Strength: number;
  Stamina: number;
  SetPiece: number;
  Dribbling: number;
  Vision: number;
  PreferredFoot: string;
  AttackingMindset: boolean;
  DefensiveMindset: boolean;
  [key: string]: any;
}

export interface Player {
  _id?: string;
  /** Name of the Player! */
  FirstName: string;
  LastName: string;
  Age: string;
  PlayerID: string;
  /** Players Nationality */
  Nationality: string;
  /** overall Player rating */
  Rating: number;
  /** Goals scored in total */
  GoalsScored: number;
  Position: string;
  ShirtNumber: string;
  /** Collecting of Player's attributes */
  Attributes: PlayerAttributes;
  /** Player tally */
  Stats: PlayerStats;
  /** Monetary value of Player */
  Value: number;
  /** Some Players don't have clubs (free agents) hence can be undefined */
  ClubCode?: string;
}

export const AttackerMultipliers: Multipliers = {
  Speed: 0.11,
  Shooting: 0.32,
  LongPass: 0.02,
  ShortPass: 0.03,
  Mental: 0.08,
  Control: 0.18,
  Tackling: 0.01,
  Strength: 0.06,
  Stamina: 0.05,
  Keeping: 0,
  SetPiece: 0.04,
  Dribbling: 0.1,
};

export const GoalkeeperMultipliers: Multipliers = {
  Speed: 0.0,
  Shooting: 0.0,
  LongPass: 0.08,
  ShortPass: 0.04,
  Mental: 0.05,
  Control: 0.05,
  Tackling: 0.0,
  Strength: 0.05,
  Stamina: 0.03,
  Keeping: 0.7,
  SetPiece: 0.0,
  Dribbling: 0.0,
};

export const MidfielderMultipliers: Multipliers = {
  Speed: 0.05,
  Shooting: 0.1,
  LongPass: 0.2,
  ShortPass: 0.2,
  Mental: 0.1,
  Control: 0.08,
  Tackling: 0.02,
  Strength: 0.04,
  Stamina: 0.08,
  Keeping: 0,
  SetPiece: 0.04,
  Dribbling: 0.09,
};

export const DefenderMultipliers: Multipliers = {
  Speed: 0.04,
  Shooting: 0.01,
  LongPass: 0.05,
  ShortPass: 0.05,
  Mental: 0.1,
  Control: 0.07,
  Tackling: 0.42,
  Strength: 0.2,
  Stamina: 0.04,
  Keeping: 0.0,
  SetPiece: 0.02,
  Dribbling: 0.0,
};

export interface Multipliers {
  Speed: number;
  Shooting: number;
  LongPass: number;
  ShortPass: number;
  Mental: number;
  Tackling: number;
  Keeping: number;
  Control: number;
  Strength: number;
  Stamina: number;
  SetPiece: number;
  Dribbling: number;
}

export interface PlayerStats {
  Goals: number;
  Saves: number;
  YellowCards: number;
  RedCards: number;
  Assists: number;
  CleanSheets: number;
}

export interface Appearance {
  head: AppearanceFeature;
  complexion: string | undefined;
  hair: AppearanceFeature;
  eyes: AppearanceFeature;
  eyebrows: AppearanceFeature;
  nose: AppearanceFeature;
  mouth: AppearanceFeature;
}

interface AppearanceFeature {
  variant: string | undefined;
  style: string | undefined;
}
