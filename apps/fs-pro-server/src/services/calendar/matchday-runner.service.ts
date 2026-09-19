import { getFixturesByDay } from '../../controllers/fixtures/fixture.service';
import { play } from '../../controllers/game/game.controller';
import { getCalendar, advanceDayIfDone } from '../../controllers/calendar/calendar.service';

export interface MatchdayRunResult {
  day: number;
  totalFixtures: number;
  simulatedFixtures: number;
  results: any[];
  advancedToDay: number | null;
}

export class MatchdayRunnerService {
  /**
   * Simulates all unplayed fixtures for a given day in the calendar.
   * If liveFixtureId is provided, simulates that specific match with full 2D fidelity;
   * all other fixtures on the day run via QuickSim.
   */
  public static async simulateDay(
    dayNumber?: number,
    options?: { liveFixtureId?: string }
  ): Promise<MatchdayRunResult> {
    const calendar = await getCalendar();
    const targetDay = dayNumber ?? calendar.CurrentDay;

    const dayFixtures = await getFixturesByDay(targetDay);
    const unplayed = dayFixtures.filter((f) => !f.Played && f._id);

    const results: any[] = [];

    for (const fixture of unplayed) {
      const isLive = Boolean(
        options?.liveFixtureId && String(fixture._id) === String(options.liveFixtureId)
      );
      const res = await play(fixture._id as string, { quickSim: !isLive });
      results.push(res);
    }

    const advanceResult = await advanceDayIfDone(targetDay);
    const updatedCalendar = advanceResult ?? (await getCalendar());

    return {
      day: targetDay,
      totalFixtures: dayFixtures.length,
      simulatedFixtures: unplayed.length,
      results,
      advancedToDay: updatedCalendar.CurrentDay,
    };
  }
}
