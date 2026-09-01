import path from 'path';
import { Worker } from 'worker_threads';
import { getFixtureById } from '../controllers/fixtures/fixture.service';
import { fetchClubs } from '../controllers/clubs/club.service';
import { resolveManagerTactic } from '../controllers/managers/manager.service';
import { startMatchReplay, IReplayableMatch } from '../realtime/matchBroadcaster';
import { ITactic } from '../state/PersistentState/Formations';

/**
 * Deliberately conservative: this path is new and unaudited, and doesn't
 * persist results yet (see matchQueue's docblock below) - bump this once
 * concurrent-write safety of the persistence chain has actually been
 * thought through.
 */
const MAX_CONCURRENT_MATCHES = 1;

const queue: string[] = [];
const inFlight = new Set<string>();

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
 * pipeline (e.g. via PitchPreview.html) without touching the existing
 * synchronous play()/restPlayGame flow real clients still use.
 */
export function enqueueMatchPlay(fixtureId: string): { queued: boolean; reason?: string } {
  if (inFlight.has(fixtureId) || queue.includes(fixtureId)) {
    return { queued: false, reason: 'Match already queued or in progress' };
  }

  queue.push(fixtureId);
  console.log(`[queue] enqueued ${fixtureId} (queue length ${queue.length})`);
  pump();

  return { queued: true };
}

function pump(): void {
  while (inFlight.size < MAX_CONCURRENT_MATCHES && queue.length > 0) {
    const fixtureId = queue.shift()!;
    inFlight.add(fixtureId);

    runMatchJob(fixtureId)
      .catch((err) => {
        console.error(`[queue] job failed for ${fixtureId}:`, err);
      })
      .finally(() => {
        inFlight.delete(fixtureId);
        pump();
      });
  }
}

async function runMatchJob(fixtureId: string): Promise<void> {
  console.log(`[queue] starting job for ${fixtureId}`);

  const fixture = await getFixtureById(fixtureId);
  if (!fixture) {
    throw new Error(`Fixture not found: ${fixtureId}`);
  }

  const home = fixture.HomeTeam.toString();
  const away = fixture.AwayTeam.toString();

  const clubs = await fetchClubs({ _id: { $in: [home, away] } });
  const homeClub = clubs.find((c: any) => c._id?.toString() === home);
  const awayClub = clubs.find((c: any) => c._id?.toString() === away);

  // Resolved here, not inside the worker - a worker_thread has no DB
  // connection to look managers up with (same reason clubs are prefetched).
  const tactics: { home: ITactic; away: ITactic } = {
    home: await resolveManagerTactic(homeClub?.Manager),
    away: await resolveManagerTactic(awayClub?.Manager),
  };

  // Strip Mongoose/BSON ObjectId instances etc. down to plain data before
  // it crosses the worker_thread boundary (workerData is structured-clone,
  // not every Mongoose-lean() field survives that cleanly).
  const plainClubs = JSON.parse(JSON.stringify(clubs));

  const result = await runInWorker(fixtureId, {
    clubs: plainClubs,
    sides: { home, away },
    tactics,
  });

  console.log(`[queue] ${fixtureId} simulated: ${result.Frames.length} frames`);

  startMatchReplay(result, fixtureId);
}

interface IWorkerMessage {
  ok: boolean;
  result?: IReplayableMatch;
  error?: string;
  /** The original error's stack, sent separately - postMessage's structured
   * clone doesn't reliably preserve a plain Error's .stack. */
  stack?: string;
}

/** Builds an Error whose .stack is the ORIGINAL failure's stack (from
 * inside the worker) rather than this call site, so `console.error`ing it
 * upstream actually shows where in the simulation things broke. */
function workerFailure(fixtureId: string, msg: IWorkerMessage | undefined, fallback: string): Error {
  const message = msg?.error || fallback;
  const error = new Error(`[worker:${fixtureId}] ${message}`);
  if (msg?.stack) {
    error.stack = msg.stack;
  }
  return error;
}

function runInWorker(
  fixtureId: string,
  workerData: {
    clubs: unknown[];
    sides: { home: string; away: string };
    tactics: { home: ITactic; away: ITactic };
  }
): Promise<IReplayableMatch> {
  return new Promise((resolve, reject) => {
    const isTs = __filename.endsWith('.ts');
    const workerPath = path.join(__dirname, `matchSimWorker.${isTs ? 'ts' : 'js'}`);

    const worker = new Worker(workerPath, {
      workerData,
      execArgv: isTs ? ['-r', 'ts-node/register/transpile-only'] : [],
    });

    worker.on('message', (msg: IWorkerMessage) => {
      if (msg.ok && msg.result) {
        resolve(msg.result);
      } else {
        reject(workerFailure(fixtureId, msg, 'Worker reported failure with no error message'));
      }
      worker.terminate();
    });

    worker.on('error', (err) => {
      console.error(`[queue] worker error for ${fixtureId}:`, err);
      reject(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        const error = new Error(`matchSimWorker for ${fixtureId} exited with code ${code}`);
        console.error(`[queue] ${error.message}`);
        reject(error);
      }
    });
  });
}
