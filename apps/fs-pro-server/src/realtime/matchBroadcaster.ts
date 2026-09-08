import { IMatchDetails, IMatchFrame } from '../simulation/classes/Match';
import { getMatchReplayNamespace } from './io';
import { expandFrames } from './frameInterpolation';

const DEFAULT_TICK_MS = 300;

/**
 * Everything replayMatch actually reads off a finished match. A real
 * `Match` instance satisfies this structurally, but so does the plain
 * result object a worker_thread posts back (see src/jobs/matchSimWorker.ts)
 * - the simulation itself may now run somewhere that never held a real
 * `Match` class instance.
 */
export interface IReplayableMatch {
  Home: { _id: string; Name: string; ClubCode: string };
  Away: { _id: string; Name: string; ClubCode: string };
  Frames: IMatchFrame[];
  Details: IMatchDetails;
}

/**
 * Streams a fully-simulated match's recorded Frames out over Socket.IO,
 * paced in real time, to the room keyed by `fixtureId`. The simulation
 * itself already ran to completion (Game.gameLoop) - this only controls
 * how fast the already-known outcome is revealed to watchers, so the sim
 * stays fast/synchronous/deterministic while clients still get a live feed.
 *
 * `fixtureId` (not `match.id`) is used as the room key because it's the one
 * identifier a human can know *before* triggering kickoff - `match.id` is
 * only generated inside the same request that starts the replay, leaving no
 * practical window to join the room first.
 */
export function replayMatch(
  match: IReplayableMatch,
  fixtureId: string,
  // Kept for signature compatibility - no longer drives pacing. Real per-step
  // delays now come from `expandFrames()` (see frameInterpolation.ts), which
  // derives each tick's on-screen duration from how far the ball/players
  // actually moved that tick rather than a fixed interval.
  tickMs = DEFAULT_TICK_MS
): Promise<void> {
  return new Promise((resolve) => {
    const room = getMatchReplayNamespace().to(fixtureId);
    const steps = expandFrames(match.Frames);

    console.log(
      `[replay] starting ${fixtureId}: ${match.Frames.length} ticks -> ${steps.length} playback frames`
    );

    room.emit('match-replay-start', {
      fixtureId,
      home: {
        id: match.Home._id,
        name: match.Home.Name,
        code: match.Home.ClubCode,
      },
      away: {
        id: match.Away._id,
        name: match.Away.Name,
        code: match.Away.ClubCode,
      },
      totalFrames: steps.length,
      tickMs,
    });

    let i = 0;
    const tick = () => {
      if (i >= steps.length) {
        console.log(`[replay] ${fixtureId} complete, ${i} frames emitted`);
        room.emit('match-replay-end', { fixtureId, details: match.Details });
        resolve();
        return;
      }

      room.emit('match-frame', steps[i].frame);
      const delay = steps[i].delayMs;
      i++;
      setTimeout(tick, delay);
    };

    tick();
  });
}

/** Fire-and-forget wrapper so callers don't need their own .catch. */
export function startMatchReplay(
  match: IReplayableMatch,
  fixtureId: string,
  tickMs?: number
): void {
  replayMatch(match, fixtureId, tickMs).catch((err) => {
    console.error(`[replay] error replaying match ${fixtureId}:`, err);
  });
}
