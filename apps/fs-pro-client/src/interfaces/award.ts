import { Club } from './club';
import { Manager } from './manager';
import { Player } from './player';

export interface Award {
  _id: string;
  Name: string;
  Type: 'manager' | 'player';
  Period: 'season' | 'year' | 'all-time';
  Category: string;
  /** Polymorphic - a Player or Manager depending on `Type`, populated only
   * when the route requests it (`?populate=`/`?recipient=`). */
  RecipientId: string;
  Recipient?: Player | Manager;
  ClubId: string;
  Club?: Club;
  Remarks: string;
  SeasonId: string;
}
