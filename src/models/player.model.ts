import mongoose, { Schema, Document } from 'mongoose';
import {IPlayerAttributes} from '@/interfaces/Player';
// import Player from '../types/Player';

export interface Player extends Document {
  FirstName: string;
  LastName: string;
  Age: string;
  Player_ID: string;
  Rating: number;
  GoalsScored: number;
  ShirtNumber: string;
  AttackingClass: number;
  DefensiveClass: number;
  GoalkeepingClass: number;
  Attributes: IPlayerAttributes;
  Value: number;
  ClubCode?: string;
}

const Player: Schema = new Schema(
  {
    FirstName: String,
    LastName: String,
    Age: String,
    Player_ID: String,
    Position: {
      type: String,
    },
    PositionNumber: Number,
    Attributes: {
      type: Object,
      Speed: Number,
      Shooting: Number,
      LongPass: Number,
      ShortPass: Number,
      MediumPass: Number,
      Tactics: Number,
      Tackling: Number,
      Strength: Number,
      Stamina: Number,
      PreferredFoot: String,
      AttackingMindset: Boolean,
      DefensiveMindset: Boolean,
    },
    Rating: Number,
    GoalsScored: Number,
    ShirtNumber: String,
    AttackingClass: Number,
    DefensiveClass: Number,
    GoalkeepingClass: Number,
    Value: Number,
    ClubCode: String,
  },
  { timestamps: true }
);

export default mongoose.model<Player>('Player', Player, 'Players');
