import {
  getFixturesByDay,
  findNextUnplayedDay,
  getFixtureById,
} from '../../controllers/fixtures/fixture.service';
import { play, PlayOptions } from '../../controllers/game/game.controller';
import { batchUpdateStandings } from '../../controllers/game/functions';
import {
  getCalendar,
  advanceDayIfDone,
  updateCalendar,
} from '../../controllers/calendar/calendar.service';
import { PlayerFitnessService } from '../players/player-fitness.service';
import { RankingService } from '../competitions/ranking.service';
import { EditionService } from '../competitions/edition.service';

export interface MatchdayRunResult {
  day: number;
  totalFixtures: number;
  simulatedFixtures: number;
  failedFixtures: number;
  results: any[];
  advancedToDay: number | null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes an individual fixture simulation with automatic retry, exponential backoff,
 * and idempotency checking.
 */
async function simulateFixtureWithRetry(
  fixtureId: string,
  options: PlayOptions,
  maxRetries = 3
): Promise<any> {
  const existing = await getFixtureById(fixtureId);
  if (!existing) {
    throw new Error(`Fixture ${fixtureId} not found`);
  }
  // Idempotency: if already marked played (e.g. from previous run), do not duplicate stats
  if (existing.Played) {
    return { skipped: true, fixture: existing };
  }

  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await play(fixtureId, options);
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[simulateFixtureWithRetry] Attempt ${attempt}/${maxRetries} failed for fixture ${fixtureId}:`,
        err?.message || err
      );
      if (attempt < maxRetries) {
        // Exponential backoff with random jitter (50ms, 100ms, 150ms...)
        await delay(attempt * 50 + Math.floor(Math.random() * 30));
      }
    }
  }
  throw lastError;
}

/**
 * Runs a list of items with controlled concurrency pool.
 * Guarantees that no more than `concurrency` tasks run in parallel,
 * protecting PostgreSQL connection pool from exhaustion.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  workerFn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < items.length) {
      const current = nextIdx++;
      try {
        const value = await workerFn(items[current]);
        results[current] = { status: 'fulfilled', value };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  if (workerCount <= 0) return [];

  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

export class MatchdayRunnerService {
  /**
   * Simulates all unplayed fixtures for a given day in the calendar concurrently.
   * - Uses controlled worker concurrency (default 4) matching DB pool limits.
   * - Automatic idempotency check & 3x retries with exponential backoff on transient errors.
   * - Decouples standings updates and day advance from individual matches, eliminating race conditions.
   * - Atomically updates standings once per affected Season at day conclusion.
   */
  public static async simulateDay(
    dayNumber?: number,
    options?: {
      liveFixtureId?: string;
      concurrency?: number;
      /** Only play the day; the caller moves the calendar on (the world day
       * loop in services/world/world-day.service.ts). */
      skipAdvance?: boolean;
    }
  ): Promise<MatchdayRunResult> {
    const calendar = await getCalendar();
    const targetDay = dayNumber ?? calendar.CurrentDay;

    const dayFixtures = await getFixturesByDay(targetDay);
    const unplayed = dayFixtures.filter((f) => !f.Played && f._id);

    if (unplayed.length === 0) {
      if (options?.skipAdvance) {
        return {
          day: targetDay,
          totalFixtures: dayFixtures.length,
          simulatedFixtures: 0,
          failedFixtures: 0,
          results: [],
          advancedToDay: null,
        };
      }
      // Nothing left to play today - an empty day (off-season idling) counts as done.
      const advanceResult = await advanceDayIfDone(targetDay, { allowEmptyDay: true });
      const updatedCalendar = advanceResult ?? (await getCalendar());
      return {
        day: targetDay,
        totalFixtures: dayFixtures.length,
        simulatedFixtures: 0,
        failedFixtures: 0,
        results: [],
        advancedToDay: updatedCalendar.CurrentDay,
      };
    }

    const concurrency = options?.concurrency ?? 4;

    // Run unplayed fixtures concurrently with retries
    const settled = await runWithConcurrency(unplayed, concurrency, async (fixture) => {
      const isLive = Boolean(
        options?.liveFixtureId && String(fixture._id) === String(options.liveFixtureId)
      );
      return simulateFixtureWithRetry(
        fixture._id as string,
        {
          quickSim: !isLive,
          skipStandings: true,
          skipDayAdvance: true,
          skipReplay: !isLive,
        },
        3
      );
    });

    const fulfilledResults: any[] = [];
    let failedCount = 0;

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        fulfilledResults.push(outcome.value);
      } else {
        failedCount++;
        console.error(
          `[simulateDay] Fixture ${unplayed[i]._id} failed permanently after 3 retries:`,
          outcome.reason
        );
      }
    }

    // Competition fixtures go to Rankings (idempotent per fixture); the rest
    // still use the legacy week tables until they're removed.
    const legacyResults: any[] = [];
    for (const res of fulfilledResults) {
      const fixtureId = res?.match?._id ?? res?.fixture?._id;
      const applied = fixtureId
        ? await RankingService.applyResult(String(fixtureId))
        : { status: 'not-competition' as const };
      if (applied.status === 'applied' && applied.firstToReachedBy) {
        await EditionService.finish(applied.seasonId, { firstToWinner: applied.firstToReachedBy });
      }
      if (applied.status === 'not-competition' && !res?.skipped) legacyResults.push(res);
    }

    // Atomically batch-update standings across all affected seasons
    if (legacyResults.length > 0) {
      await batchUpdateStandings(legacyResults);
    }

    if (options?.skipAdvance) {
      return {
        day: targetDay,
        totalFixtures: dayFixtures.length,
        simulatedFixtures: fulfilledResults.length,
        failedFixtures: failedCount,
        results: fulfilledResults,
        advancedToDay: null,
      };
    }

    // Advance calendar day once after all fixtures have settled
    const advanceResult = await advanceDayIfDone(targetDay);
    const updatedCalendar = advanceResult ?? (await getCalendar());

    return {
      day: targetDay,
      totalFixtures: dayFixtures.length,
      simulatedFixtures: fulfilledResults.length,
      failedFixtures: failedCount,
      results: fulfilledResults,
      advancedToDay: updatedCalendar.CurrentDay,
    };
  }

  /**
   * Simulates forward up to a target day or date using high-speed fail-safe parallel simulation.
   */
  public static async simulateToDate(options: {
    targetDay?: number;
    targetDate?: string | Date;
    includeTargetDay?: boolean;
    concurrency?: number;
  }): Promise<{
    startDay: number;
    currentDay: number;
    currentDate: string;
    simulatedFixtures: number;
    failedFixtures: number;
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
        const run = await this.simulateDay(calendar.CurrentDay, { concurrency: options.concurrency });
        const updated = await getCalendar();
        return {
          startDay,
          currentDay: updated.CurrentDay,
          currentDate: new Date(updated.CurrentDate).toISOString(),
          simulatedFixtures: run.simulatedFixtures,
          failedFixtures: run.failedFixtures,
          simulatedDays: run.advancedToDay && run.advancedToDay !== startDay ? 1 : 0,
        };
      }

      return {
        startDay,
        currentDay: calendar.CurrentDay,
        currentDate: new Date(calendar.CurrentDate).toISOString(),
        simulatedFixtures: 0,
        failedFixtures: 0,
        simulatedDays: 0,
      };
    }

    let totalSimulatedFixtures = 0;
    let totalFailedFixtures = 0;
    let totalSimulatedDays = 0;
    const maxDay = options.includeTargetDay === false ? targetDay - 1 : targetDay;

    const MAX_DAYS = 365;
    let iterations = 0;

    while (calendar.CurrentDay <= maxDay && iterations < MAX_DAYS) {
      iterations++;
      const currentDay = calendar.CurrentDay;
      const dayFixtures = await getFixturesByDay(currentDay);

      // If no fixtures on this calendar day, fast-forward directly to next unplayed day
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

      // Simulate day concurrently with retry mechanism
      const dayRun = await this.simulateDay(currentDay, { concurrency: options.concurrency });
      totalSimulatedFixtures += dayRun.simulatedFixtures;
      totalFailedFixtures += dayRun.failedFixtures;

      const updated = await getCalendar();
      if (updated.CurrentDay > currentDay) {
        totalSimulatedDays += updated.CurrentDay - currentDay;
        calendar = updated;
      } else {
        // Guard against infinite loop if day could not advance
        break;
      }
    }

    const finalCalendar = await getCalendar();
    return {
      startDay,
      currentDay: finalCalendar.CurrentDay,
      currentDate: new Date(finalCalendar.CurrentDate).toISOString(),
      simulatedFixtures: totalSimulatedFixtures,
      failedFixtures: totalFailedFixtures,
      simulatedDays: totalSimulatedDays,
    };
  }
}
