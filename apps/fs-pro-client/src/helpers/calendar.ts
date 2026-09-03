import type { Fixture } from '@repo/api-contract';
import { IDayGroup } from '@/interfaces/calendar';

/** Groups a flat list of Fixtures (from `GET /fixtures?scheduledDayFrom=&
 * scheduledDayTo=`) into one entry per distinct `ScheduledDay` present in
 * the range, sorted ascending. A day with no fixtures at all in the fetched
 * range simply has no entry - there's no "empty day" concept to fill in
 * client-side (unlike the old free-day placeholders the server used to
 * generate up front). */
export function groupFixturesByDay(fixtures: Fixture[]): IDayGroup[] {
  const byDay = new Map<number, Fixture[]>();

  fixtures.forEach((fixture) => {
    if (fixture.ScheduledDay == null) return;
    const existing = byDay.get(fixture.ScheduledDay) ?? [];
    existing.push(fixture);
    byDay.set(fixture.ScheduledDay, existing);
  });

  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([Day, Matches]) => ({ Day, isFree: false, Matches }));
}
