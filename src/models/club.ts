import { Player } from './player';

export interface Club {
  _id?: string;
  Name: string;
  ClubCode: string;
  AttackingClass: number;
  DefensiveClass: number;
  Players: Player[];
  assets: {
    Kit: string;
    Logo: string;
    Stadium: string;
  };
  Address: {};
  Manager: string;
  Stadium: {};
  LeagueCode: string;
  League: string;
}
