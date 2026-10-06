/**
 * Plays matches on the sim service - the Rust match engine behind the Go
 * service in services/sim-service. It is the ONLY match engine: there is no
 * in-process or statistical fallback, so every fixture in the world is
 * played by the same model. If the service is down, the match fails with
 * a clear error and the caller retries it later (the matchday runner
 * retries, past-fixture healing picks it up next pass).
 *
 * Requests run concurrently up to SIM_SERVICE_CONCURRENCY (the service
 * itself spreads them over its CPU cores), each with a timeout.
 */
import { getFixtureById } from '../controllers/fixtures/fixture.service';
import { buildSimulateMatchRequest } from './buildSimulateMatchRequest';
import {
  SimulateMatchRequest,
  SimulateMatchResult,
  SimulatedMatchData,
  SimulationMetrics,
} from './simulationContract';
import { startMatchReplay } from '../realtime/matchBroadcaster';
import { frameCount } from '../realtime/packedFrames';

const SIM_SERVICE_URL = (process.env.SIM_SERVICE_URL ?? 'http://127.0.0.1:5050').replace(/\/$/, '');
const MAX_CONCURRENT = parseInt(process.env.SIM_SERVICE_CONCURRENCY ?? '8', 10);
const MATCH_TIMEOUT_MS = parseInt(process.env.SIMULATION_MATCH_TIMEOUT_MS ?? '30000', 10);

let inFlight = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    next(); // the slot passes straight to the next waiter
  } else {
    inFlight--;
  }
}

/**
 * Plays one match. Resolves `{ ok: false, error }` when the service is
 * unreachable, times out, or rejects the request - callers decide whether
 * to retry; nothing here substitutes a different engine.
 */
export async function simulateMatch(request: SimulateMatchRequest): Promise<SimulateMatchResult> {
  const queuedAt = Date.now();
  await acquire();
  const startedAt = Date.now();
  const metrics = (): SimulationMetrics => {
    const finishedAt = Date.now();
    return {
      queuedAt,
      startedAt,
      finishedAt,
      queueWaitMs: startedAt - queuedAt,
      simulationMs: finishedAt - startedAt,
      totalMs: finishedAt - queuedAt,
    };
  };
  const fail = (error: string): SimulateMatchResult => {
    console.error(`[sim] fixture ${request.fixtureId}: ${error}`);
    return { ok: false, fixtureId: request.fixtureId, error, metrics: metrics() };
  };

  try {
    let res: Response;
    try {
      res = await fetch(`${SIM_SERVICE_URL}/sim/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(MATCH_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = (err as Error).name === 'TimeoutError' ? `timed out after ${MATCH_TIMEOUT_MS}ms` : (err as Error).message;
      return fail(`sim service unreachable at ${SIM_SERVICE_URL} (${reason}) - is it running? (npm run dev:all starts it)`);
    }

    const body = (await res.json().catch(() => undefined)) as
      | { ok: boolean; match?: SimulatedMatchData; error?: string }
      | undefined;
    if (!res.ok || !body?.ok || !body.match) {
      return fail(`sim service rejected the match (HTTP ${res.status}: ${body?.error ?? 'no match in response'})`);
    }
    return { ok: true, fixtureId: request.fixtureId, match: body.match, metrics: metrics() };
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------
// Debug path: play a fixture and stream it, without saving anything.
// ---------------------------------------------------------------------

const debugInFlight = new Set<string>();

/**
 * Plays `fixtureId` and replays it live over Socket.IO (see
 * realtime/matchBroadcaster.ts), without persisting anything - for
 * exercising the replay pipeline. The caller gets an immediate ack.
 */
export function enqueueMatchPlay(fixtureId: string): { queued: boolean; reason?: string } {
  if (debugInFlight.has(fixtureId)) {
    return { queued: false, reason: 'Match already queued or in progress' };
  }
  debugInFlight.add(fixtureId);
  runDebugJob(fixtureId)
    .catch((err) => console.error(`[sim] debug job failed for ${fixtureId}:`, err))
    .finally(() => debugInFlight.delete(fixtureId));
  return { queued: true };
}

async function runDebugJob(fixtureId: string): Promise<void> {
  const fixture = await getFixtureById(fixtureId);
  if (!fixture) {
    throw new Error(`Fixture not found: ${fixtureId}`);
  }
  const request = await buildSimulateMatchRequest(fixtureId, fixture.HomeTeamId, fixture.AwayTeamId);
  const result = await simulateMatch(request);
  if (!result.ok) {
    return;
  }
  console.log(`[sim] ${fixtureId} simulated: ${frameCount(result.match.Frames)} frames`);
  startMatchReplay(result.match, fixtureId);
}
