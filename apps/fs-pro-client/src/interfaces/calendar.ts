import type { Fixture } from '@repo/api-contract';

/** The one perpetual Calendar - a game-world clock, independent of the
 * real-world date. `CurrentDate` is the in-game date, not "today". */
export interface ICalendar {
  _id?: string;
  CurrentDay: number;
  CurrentDate: string;
}

/** Client-side grouping of Fixtures scheduled on the same absolute day -
 * built by grouping the flat `GET /fixtures?scheduledDayFrom=&scheduledDayTo=`
 * response, since Fixtures own their own schedule now (no more `Day.Matches`
 * array from the server). */
export interface IDayGroup {
  Day: number;
  isFree: boolean;
  Matches: Fixture[];
}
