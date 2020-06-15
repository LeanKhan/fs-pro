export interface CalendarMatch {
  Fixture: string;
  MatchType: string;
  Time: string;
  Competition: string;
  Played: boolean;
}

export interface CalendarDay {
  Matches: CalendarMatch[];
  isFree: boolean;
}

export interface CalendarInterface {
  Name: string;
  YearString: string; // june-2020
  YearDigits: string; // 06-2020
  CurrentDay: number;
  Days: CalendarDay[];
}
