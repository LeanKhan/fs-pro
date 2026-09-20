import {
  getFixturesByDay,
  findNextUnplayedDay,
} from '../../controllers/fixtures/fixture.service';
import { play } from '../../controllers/game/game.controller';
import {
  getCalendar,
  advanceDayIfDone,
  updateCalendar,
} from '../../controllers/calendar/calendar.service';
import { PlayerFitnessService } from '../players/player-fitness.service';

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
      try {
        const res = await play(fixture._id as string, { quickSim: !isLive });
        results.push(res);
      } catch (err) {
        console.error(`[simulateDay] Error simulating fixture ${fixture._id}:`, err);
      }
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

  /**
   * Simulates forward up to a target day or date.
   * Simulates all unplayed fixtures via QuickSim, sequentially advancing the calendar
   * and recovering player fitness/injuries day by day.
   */
  public static async simulateToDate(options: {
    targetDay?: number;
    targetDate?: string | Date;
    includeTargetDay?: boolean;
  }): Promise<{
    startDay: number;
    currentDay: number;
    currentDate: string;
    simulatedFixtures: number;
    simulatedDays: number;
  }> {
    const DAY_MS = 24 * 60 * 60 * 1000;
    let calendar = await getCalendar();
    const startDay = calendar.CurrentDay;

    let targetDay = options.targetDay;
    if (targetDay === undefined && options.targetDate) {
      const targetTime = new Date(options.targetDate).getTime();
      const currentTime = new Date(calendar.CurrentDate).getTime();
      const diffDays = Math.round((targetTime - currentTime) / DAY_MS);
      targetDay = Math.max(calendar.CurrentDay, calendar.CurrentDay + diffDays);
    }

    if (targetDay === undefined || targetDay <= calendar.CurrentDay) {
      if (
        options.includeTargetDay !== false &&
        targetDay !== undefined &&
        targetDay === calendar.CurrentDay
      ) {
        const run = await this.simulateDay(calendar.CurrentDay);
        const updated = await getCalendar();
        return {
          startDay,
          currentDay: updated.CurrentDay,
          currentDate: new Date(updated.CurrentDate).toISOString(),
          simulatedFixtures: run.simulatedFixtures,
          simulatedDays: run.advancedToDay && run.advancedToDay !== startDay ? 1 : 0,
        };
      }

      return {
        startDay,
        currentDay: calendar.CurrentDay,
        currentDate: new Date(calendar.CurrentDate).toISOString(),
        simulatedFixtures: 0,
        simulatedDays: 0,
      };
    }

    let totalSimulatedFixtures = 0;
    let totalSimulatedDays = 0;
    const maxDay = options.includeTargetDay === false ? targetDay - 1 : targetDay;

    const MAX_DAYS = 365;
    let iterations = 0;

    while (calendar.CurrentDay <= maxDay && iterations < MAX_DAYS) {
      iterations++;
      const currentDay = calendar.CurrentDay;
      const dayFixtures = await getFixturesByDay(currentDay);

      if (dayFixtures.length === 0) {
        const next = await findNextUnplayedDay(currentDay);
        if (next && next.day <= maxDay) {
          const daysElapsed = next.day - currentDay;
          if (daysElapsed > 0) {
            try {
              await PlayerFitnessService.recoverFitnessAndInjuries(daysElapsed);
            } catch (err) {
              console.error('Error recovering fitness on off-day advance:', err);
            }
          }
          calendar = await updateCalendar({ CurrentDay: next.day, CurrentDate: next.date });
          totalSimulatedDays += daysElapsed;
          continue;
        } else {
          break;
        }
      }

      const dayRun = await this.simulateDay(currentDay);
      totalSimulatedFixtures += dayRun.simulatedFixtures;

      const updated = await getCalendar();
      if (updated.CurrentDay > currentDay) {
        totalSimulatedDays += updated.CurrentDay - currentDay;
        calendar = updated;
      } else {
        break;
      }
    }

    const finalCalendar = await getCalendar();
    return {
      startDay,
      currentDay: finalCalendar.CurrentDay,
      currentDate: new Date(finalCalendar.CurrentDate).toISOString(),
      simulatedFixtures: totalSimulatedFixtures,
      simulatedDays: totalSimulatedDays,
    };
  }
}

