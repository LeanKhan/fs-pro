/**
 * Runs one match's simulation in isolation from the main thread.
 *
 * This is a worker_thread entry point, not a normal module - it's spawned
 * fresh per match by matchQueue.ts. Being a separate worker isn't just a
 * performance choice: it gives this match its own isolated V8 realm and
 * fresh require() cache, so the simulation's module-level singletons
 * (Coordinates._co, App.instance, the matchEvents/ballMove EventEmitters in
 * utils/events.ts) all re-initialize per worker with zero cross-match
 * contamination - something the shared-process model can't guarantee today.
 *
 * Deliberately DB-free: all Mongo reads happen in the main thread
 * (matchQueue.ts), which hands this worker already-fetched, plain-JSON
 * club data via workerData instead of letting it call fetchClubs itself.
 */
import { parentPort, workerData } from 'worker_threads';
import App from '../controllers/app/App';
import { IClub } from '../interfaces/Club';
import { ITactic } from '../state/PersistentState/Formations';

interface IMatchSimWorkerData {
  clubs: IClub[];
  sides: { home: string; away: string };
  tactics: { home: ITactic; away: ITactic };
}

async function main() {
  const { clubs, sides, tactics } = workerData as IMatchSimWorkerData;

  console.log(
    `[worker] simulating ${sides.home} (${tactics.home.formationName}/${tactics.home.styleName}) vs ` +
      `${sides.away} (${tactics.away.formationName}/${tactics.away.styleName})`
  );

  const app = new App();
  await app.setupGame([sides.home, sides.away], sides, clubs, tactics);
  const match = await app.startGame();

  if (!match) {
    throw new Error('Simulation did not resolve a Match (startGame returned undefined)');
  }

  console.log(`[worker] simulation finished, ${match.Frames.length} frames captured`);

  parentPort!.postMessage({
    ok: true,
    result: {
      Home: { _id: match.Home._id, Name: match.Home.Name, ClubCode: match.Home.ClubCode },
      Away: { _id: match.Away._id, Name: match.Away.Name, ClubCode: match.Away.ClubCode },
      Details: match.Details,
      Frames: match.Frames,
      Events: match.Events,
    },
  });
}

/**
 * A rejected `main()` promise only carries a deliberately-thrown/caught
 * error - anything genuinely unexpected (a bug deep in the simulation) is
 * exactly what App.startGame()'s own try/catch does NOT cover (it only
 * catches a synchronous throw from calling startHalf(), not the returned
 * promise rejecting later), so this is often the FIRST point anything logs
 * the failure at all. Log the real error (with stack) directly to this
 * worker's console - which Node pipes through to the main process's stdout
 * same as every other simulation log - AND forward the stack in the
 * message, since postMessage's structured clone does not reliably carry a
 * plain Error's .stack the way Node's own 'error' event does.
 */
function reportFailure(err: unknown) {
  console.error('[worker] simulation failed:', err);
  const error = err instanceof Error ? err : new Error(String(err));
  parentPort!.postMessage({ ok: false, error: error.message, stack: error.stack });
}

main().catch(reportFailure);

// Defense in depth: catch anything that escapes main()'s own await chain
// entirely (e.g. a fire-and-forget bug), so the job always gets an answer
// back instead of the worker just exiting with no diagnostic info.
process.on('uncaughtException', reportFailure);
process.on('unhandledRejection', reportFailure);
