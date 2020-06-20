/* eslint-disable @typescript-eslint/interface-name-prefix */
import { IFixture } from './fixture';

export interface ICalendarMatch {
  Fixture: IFixture;
  MatchType: string;
  Time: string;
  Competition: string;
  Played: boolean;
}

export interface ICalendarDay {
  Matches: ICalendarMatch[];
  isFree: boolean;
}

export interface ICalendar {
  Name: string;
  YearString: string; // june-2020
  YearDigits: string; // 06-2020
  CurrentDay: number;
  Days: ICalendarDay[];
}
