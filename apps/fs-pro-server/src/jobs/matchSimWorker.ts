/**
 * Long-lived match simulation worker (worker_thread entry point, owned by
 * matchQueue.ts's worker pool).
 *
 * Each worker runs ONE match at a time, then waits for the next job. It
 * used to be spawned fresh per match purely for isolation from the
 * simulation's module-level state (Coordinates._co, the global simulation
 * RandomSource, the matchEvents/ballMove/decisionEvents EventEmitters) -
 * but re-loading the whole module graph cost ~1s per match against ~11ms
 * of actual simulation. Reuse is safe because:
 *   - matches run strictly sequentially inside a worker,
 *   - every per-match global (Coordinates._co, the RandomSource) is
 *     re-assigned by App.setupGame()/Game's constructor at match start,
 *   - the shared emitters are cleared before every match (below), so a
 *     match that crashed half-way can't leave listeners for the next one.
 * matchQueue.ts still replaces a worker after any failure or timeout, as a
 * second line of defense.
 *
 * Deliberately DB-free: all DB reads happen in the main thread, which hands
 * this worker already-fetched, plain-JSON club data per job.
 */
import { parentPort } from 'worker_threads';
import App from '../controllers/app/App';
import { packFrames } from '../realtime/packedFrames';
import { ballMove, matchEvents } from '../simulation/utils/events';
import { decisionEvents } from '../simulation/decision/decisionLog';
import {
  SimulateMatchRequest,
  SimulatedMatchData,
  matchSeedFor,
} from './simulationContract';

export interface IMatchSimJob {
  jobId: number;
  request: SimulateMatchRequest;
}

export interface IMatchSimWorkerMessage {
  jobId: number;
  ok: boolean;
  result?: SimulatedMatchData;
  error?: string;
  /** The original error's stack, sent separately - postMessage's structured
   * clone doesn't reliably preserve a plain Error's .stack. */
  stack?: string;
}

/** The job currently running, so an uncaught error can still be reported
 * against the right job. */
let currentJobId: number | null = null;

/** Logged once per worker: a dev box without the sim service running
 * shouldn't print it for every match. */
let warnedServiceUnreachable = false;

/**
 * The Rust engine, via the Go sim service. Returns undefined - and says
 * why - whenever the caller has to fall back to the in-process engine, so
 * a broken service never silently turns into "every match ran on the old
 * engine".
 */
async function simulateViaService(
  request: SimulateMatchRequest
): Promise<SimulatedMatchData | undefined> {
  const url = process.env.SIM_SERVICE_URL ?? 'http://127.0.0.1:5050';

  let res: Response;
  try {
    res = await fetch(`${url}/sim/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    if (!warnedServiceUnreachable) {
      warnedServiceUnreachable = true;
      console.warn(
        `[worker] sim service unreachable at ${url} (${(err as Error).message}) - using the in-process engine`
      );
    }
    return undefined;
  }

  const body = (await res.json().catch(() => undefined)) as
    | { ok: boolean; match?: SimulatedMatchData; error?: string }
    | undefined;
  if (res.ok && body?.ok && body.match) {
    return body.match;
  }

  console.error(
    `[worker] sim service failed for fixture ${request.fixtureId} ` +
      `(HTTP ${res.status}: ${body?.error ?? 'no match in response'}) - falling back to the in-process engine`
  );
  return undefined;
}

async function simulate(request: SimulateMatchRequest): Promise<SimulatedMatchData> {
  const viaService = await simulateViaService(request);
  if (viaService) {
    return viaService;
  }

  // Fallback: Local Node.js engine
  const { clubs, sides, tactics } = request;

  ballMove.removeAllListeners();
  matchEvents.removeAllListeners();
  decisionEvents.removeAllListeners();

  const app = new App();
  await app.setupGame(
    [sides.home, sides.away],
    sides,
    clubs,
    tactics,
    matchSeedFor(request)
  );
  const match = await app.startGame();

  if (!match) {
    throw new Error(
      'Simulation did not resolve a Match (startGame returned undefined)'
    );
  }

  return {
    Home: {
      _id: match.Home._id,
      Name: match.Home.Name,
      ClubCode: match.Home.ClubCode,
      ManagerId: match.Home.ManagerId,
    },
    Away: {
      _id: match.Away._id,
      Name: match.Away.Name,
      ClubCode: match.Away.ClubCode,
      ManagerId: match.Away.ManagerId,
    },
    Details: match.Details,
    Frames: packFrames(match.Frames),
    Events: match.Events,
  } as SimulatedMatchData;
}

/**
 * Log the real error (with stack) to this worker's console - which Node
 * pipes through to the main process's stdout - AND forward the stack in
 * the message, since postMessage's structured clone does not reliably carry
 * a plain Error's .stack.
 */
function reportFailure(jobId: number | null, err: unknown) {
  console.error('[worker] simulation failed:', err);
  if (jobId === null) return;
  const error = err instanceof Error ? err : new Error(String(err));
  parentPort!.postMessage({
    jobId,
    ok: false,
    error: error.message,
    stack: error.stack,
  } as IMatchSimWorkerMessage);
}

parentPort!.on('message', ({ jobId, request }: IMatchSimJob) => {
  currentJobId = jobId;
  simulate(request)
    .then((result) => {
      parentPort!.postMessage({ jobId, ok: true, result } as IMatchSimWorkerMessage);
    })
    .catch((err) => reportFailure(jobId, err))
    .finally(() => {
      currentJobId = null;
    });
});

// Defense in depth: catch anything that escapes simulate()'s own await
// chain entirely (e.g. a fire-and-forget bug), so the job always gets an
// answer back instead of hanging until its timeout.
process.on('uncaughtException', (err) => reportFailure(currentJobId, err));
process.on('unhandledRejection', (err) => reportFailure(currentJobId, err));
