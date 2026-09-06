import path from 'path';
import { Worker } from 'worker_threads';
import { getFixtureById } from '../controllers/fixtures/fixture.service';
import { buildSimulateMatchRequest } from './buildSimulateMatchRequest';
import {
  SimulateMatchRequest,
  SimulateMatchResult,
  SimulatedMatchData,
  SimulationMetrics,
} from './simulationContract';
import { startMatchReplay } from '../realtime/matchBroadcaster';

/**
 * Milestone 9: bumped from the debug path's original conservative `1`.
 * This queue is no longer debug-only - the real kickoffNew flow now
 * shares it (see game.controller.ts's play()) - so `1` would serialize
 * every simultaneous match kickoff across all users behind a single
 * in-flight worker. `2` lets one real match run while another queues
 * instead of stalling outright; tune up via the env var on a beefier box.
 */
const MAX_CONCURRENT_MATCHES = parseInt(
  process.env.SIMULATION_MAX_CONCURRENT_MATCHES ?? '2',
  10
);

/**
 * Milestone 9: how long a single match is allowed to run in its worker
 * before it's treated as hung and killed. Nothing enforced this before -
 * a stuck worker used to occupy its queue slot forever. 30s is a large
 * safety margin (simRealismCheck's own benchmark runs put a real match at
 * low tens of milliseconds).
 */
const MATCH_TIMEOUT_MS = parseInt(
  process.env.SIMULATION_MATCH_TIMEOUT_MS ?? '30000',
  10
);

interface QueuedJob {
  request: SimulateMatchRequest;
  queuedAt: number;
  resolve: (result: SimulateMatchResult) => void;
  reject: (err: Error) => void;
}

const queue: QueuedJob[] = [];
const inFlight = new Set<string>();

/**
 * Milestone 9 - the "one stable internal interface" the tracker asks for.
 * Runs one match's simulation in a worker_thread, queued behind
 * MAX_CONCURRENT_MATCHES other matches if necessary, with a per-match
 * timeout and lightweight timing metrics. Both the real kickoffNew flow
 * (game.controller.ts's play()) and the debug enqueue flow
 * (enqueueMatchPlay below) call this - it's the only place a match
 * simulation is actually spawned.
 *
 * Resolves with `{ok:false,...}` for a reported simulation failure or a
 * timeout (a normal, expected outcome the caller should handle) - only
 * rejects for a genuinely unexpected infra failure (the worker itself
 * erroring or exiting with no message at all).
 */
export function simulateMatch(
  request: SimulateMatchRequest
): Promise<SimulateMatchResult> {
  return new Promise((resolve, reject) => {
    queue.push({ request, queuedAt: Date.now(), resolve, reject });
    console.log(
      `[queue] enqueued ${request.fixtureId} (queue length ${queue.length})`
    );
    pump();
  });
}

function pump(): void {
  while (inFlight.size < MAX_CONCURRENT_MATCHES && queue.length > 0) {
    const job = queue.shift()!;
    const fixtureId = job.request.fixtureId;
    inFlight.add(fixtureId);

    runQueuedJob(job)
      .finally(() => {
        inFlight.delete(fixtureId);
        pump();
      });
  }
}

async function runQueuedJob(job: QueuedJob): Promise<void> {
  const { request, queuedAt, resolve, reject } = job;
  const fixtureId = request.fixtureId;
  const startedAt = Date.now();

  console.log(`[queue] starting job for ${fixtureId}`);

  try {
    const { match, timedOut } = await runInWorker(fixtureId, request);
    const finishedAt = Date.now();
    const metrics: SimulationMetrics = {
      queuedAt,
      startedAt,
      finishedAt,
      queueWaitMs: startedAt - queuedAt,
      simulationMs: finishedAt - startedAt,
      totalMs: finishedAt - queuedAt,
    };
    console.log('[simulation-metrics]', { fixtureId, ...metrics, timedOut });

    if (timedOut) {
      resolve({
        ok: false,
        fixtureId,
        error: `Match simulation timed out after ${MATCH_TIMEOUT_MS}ms`,
        metrics,
      });
      return;
    }

    resolve({ ok: true, fixtureId, match, metrics });
  } catch (err) {
    // A genuinely unexpected infra failure (worker 'error'/nonzero exit
    // with no message) - matchSimWorker.ts's own defense-in-depth handlers
    // mean a reported *simulation* failure never reaches this branch.
    console.error(`[queue] job failed for ${fixtureId}:`, err);
    reject(err instanceof Error ? err : new Error(String(err)));
  }
}

interface IWorkerMessage {
  ok: boolean;
  result?: SimulatedMatchData;
  error?: string;
  /** The original error's stack, sent separately - postMessage's structured
   * clone doesn't reliably preserve a plain Error's .stack. */
  stack?: string;
}

/** Builds an Error whose .stack is the ORIGINAL failure's stack (from
 * inside the worker) rather than this call site, so `console.error`ing it
 * upstream actually shows where in the simulation things broke. */
function workerFailure(
  fixtureId: string,
  msg: IWorkerMessage | undefined,
  fallback: string
): Error {
  const message = msg?.error || fallback;
  const error = new Error(`[worker:${fixtureId}] ${message}`);
  if (msg?.stack) {
    error.stack = msg.stack;
  }
  return error;
}

function runInWorker(
  fixtureId: string,
  request: SimulateMatchRequest
): Promise<{
  match: SimulatedMatchData;
  timedOut: boolean;
}> {
  return new Promise((resolve, reject) => {
    const isTs = __filename.endsWith('.ts');
    const workerPath = path.join(
      __dirname,
      `matchSimWorker.${isTs ? 'ts' : 'js'}`
    );

    const worker = new Worker(workerPath, {
      workerData: {
        clubs: request.clubs,
        sides: request.sides,
        tactics: request.tactics,
      },
      execArgv: isTs ? ['-r', 'ts-node/register/transpile-only'] : [],
    });

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error(
        `[queue] worker for ${fixtureId} timed out after ${MATCH_TIMEOUT_MS}ms - terminating`
      );
      worker.terminate();
      resolve({ match: undefined as any, timedOut: true });
    }, MATCH_TIMEOUT_MS);

    worker.on('message', (msg: IWorkerMessage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (msg.ok && msg.result) {
        resolve({ match: msg.result, timedOut: false });
      } else {
        reject(
          workerFailure(
            fixtureId,
            msg,
            'Worker reported failure with no error message'
          )
        );
      }
      worker.terminate();
    });

    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error(`[queue] worker error for ${fixtureId}:`, err);
      reject(err);
    });

    worker.on('exit', (code) => {
      if (settled) return;
      if (code !== 0) {
        settled = true;
        clearTimeout(timer);
        const error = new Error(
          `matchSimWorker for ${fixtureId} exited with code ${code}`
        );
        console.error(`[queue] ${error.message}`);
        reject(error);
      }
    });
  });
}

/**
 * Enqueue a fixture to be simulated in a worker_thread and replayed live
 * over Socket.IO (see realtime/matchBroadcaster.ts), decoupled from
 * whichever HTTP request triggered it - the caller gets an immediate ack,
 * not the match result.
 *
 * Dedupes by fixture id: calling this again for a fixture that's already
 * queued or currently simulating is a no-op. This does NOT persist
 * anything to the DB (no updateFixture/updateStandings/day-advance) - it
 * only simulates and streams frames, for exercising the record-then-replay
 * pipeline (e.g. via PitchPreview.html) without touching the real
 * synchronous-looking kickoffNew flow (which, as of Milestone 9, shares
 * this same queue under the hood via simulateMatch(), but still persists
 * results the way this debug path deliberately does not).
 */
export function enqueueMatchPlay(fixtureId: string): {
  queued: boolean;
  reason?: string;
} {
  if (inFlight.has(fixtureId) || queue.some((j) => j.request.fixtureId === fixtureId)) {
    return { queued: false, reason: 'Match already queued or in progress' };
  }

  runDebugJob(fixtureId).catch((err) => {
    console.error(`[queue] debug job failed for ${fixtureId}:`, err);
  });

  return { queued: true };
}

async function runDebugJob(fixtureId: string): Promise<void> {
  const fixture = await getFixtureById(fixtureId);
  if (!fixture) {
    throw new Error(`Fixture not found: ${fixtureId}`);
  }

  const request = await buildSimulateMatchRequest(
    fixtureId,
    fixture.HomeTeamId,
    fixture.AwayTeamId
  );

  const result = await simulateMatch(request);

  if (!result.ok) {
    console.error(`[queue] simulation failed for ${fixtureId}:`, result.error);
    return;
  }

  console.log(
    `[queue] ${fixtureId} simulated: ${result.match.Frames.length} frames`
  );
  startMatchReplay(result.match, fixtureId);
}
