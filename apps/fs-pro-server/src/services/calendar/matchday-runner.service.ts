import {
  getFixturesByDay,
  getFixtureById,
} from '../../controllers/fixtures/fixture.service';
import { play, PlayOptions } from '../../controllers/game/game.controller';
import { getCalendar } from '../../controllers/calendar/calendar.service';
import { RankingService } from '../competitions/ranking.service';
import { EditionService } from '../competitions/edition.service';

export interface MatchdayRunResult {
  day: number;
  totalFixtures: number;
  simulatedFixtures: number;
  failedFixtures: number;
  results: any[];
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
   * Plays every unplayed fixture scheduled on a day, concurrently.
   * - Controlled worker concurrency (default 4) matching DB pool limits.
   * - Idempotency check and 3 retries with backoff on transient errors.
   * - Competition results go to Rankings once the matches have settled.
   * Never moves the calendar: the world day loop
   * (services/world/world-day.service.ts) does that.
   */
  public static async simulateDay(
    dayNumber?: number,
    options?: { liveFixtureId?: string; concurrency?: number }
  ): Promise<MatchdayRunResult> {
    const calendar = await getCalendar();
    const targetDay = dayNumber ?? calendar.CurrentDay;

    const dayFixtures = await getFixturesByDay(targetDay);
    const unplayed = dayFixtures.filter((f) => !f.Played && f._id);
    if (unplayed.length === 0) {
      return {
        day: targetDay,
        totalFixtures: dayFixtures.length,
        simulatedFixtures: 0,
        failedFixtures: 0,
        results: [],
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

    // Competition fixtures go to Rankings (idempotent per fixture).
    for (const res of fulfilledResults) {
      const fixtureId = res?.match?._id ?? res?.fixture?._id;
      if (!fixtureId) continue;
      const applied = await RankingService.applyResult(String(fixtureId));
      if (applied.status === 'applied' && applied.firstToReachedBy) {
        await EditionService.finish(applied.seasonId, {
          firstToWinner: applied.firstToReachedBy,
        });
      }
    }

    return {
      day: targetDay,
      totalFixtures: dayFixtures.length,
      simulatedFixtures: fulfilledResults.length,
      failedFixtures: failedCount,
      results: fulfilledResults,
    };
  }
}
