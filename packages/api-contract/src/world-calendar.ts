// packages/api-contract/src/world-calendar.ts
//
// The week template (docs/WORLD-PYRAMID-SPEC.md, "Week template"): every
// game day is a league day ('L', pyramid rounds) or a cup day ('C', knockout
// ties and challenges). Shared so the client can label days the same way
// the server schedules them.

export type DayKind = 'L' | 'C';

export const DEFAULT_WEEK_TEMPLATE: DayKind[] = ['L', 'C', 'L', 'L', 'C', 'L', 'L'];

export interface YearShape {
  WeekTemplate: DayKind[] | null | undefined;
  YearStartDay: number;
  YearLengthDays: number;
}

const template = (y: YearShape) => (y.WeekTemplate?.length ? y.WeekTemplate : DEFAULT_WEEK_TEMPLATE);

/** The kind of game day `day`, counted from the start of the year. Days
 * before the year started fall back on the same weekly cycle. */
export function dayKind(y: YearShape, day: number): DayKind {
  const t = template(y);
  const i = (((day - y.YearStartDay) % t.length) + t.length) % t.length;
  return t[i]!;
}

/** The league days of the year starting at `yearStartDay`, in order: round 1
 * plays on the first one. */
export function leagueDays(y: YearShape): number[] {
  const out: number[] = [];
  for (let d = y.YearStartDay; d < y.YearStartDay + y.YearLengthDays; d++) {
    if (dayKind(y, d) === 'L') out.push(d);
  }
  return out;
}

/** The first cup day on or after `day`, within `lastDay` if given. */
export function nextCupDay(y: YearShape, day: number, lastDay = day + 60): number | null {
  for (let d = day; d <= lastDay; d++) if (dayKind(y, d) === 'C') return d;
  return null;
}

/** The `n`-th cup day (1-based) on or after `day`. */
export function nthCupDay(y: YearShape, day: number, n: number): number {
  let seen = 0;
  for (let d = day; ; d++) {
    if (dayKind(y, d) === 'C' && ++seen >= Math.max(1, n)) return d;
  }
}
