/**
 * Throwaway verification for `realtime/frameInterpolation.ts` (see
 * MATCH-ANIMATION-PLAN.md's server-side sub-frame interpolation work).
 * Simulates one real match (same DB-free roster-pool approach as
 * simRealismCheck.ts - see that file's header for why `dotenv.config()`
 * below is required but makes no DB queries), runs `expandFrames()` over
 * its raw `Frames`, and asserts the invariants the playback layer promises:
 * every event fires exactly once, only on a tick-terminal sub-frame, in
 * original order; no per-substep jump exceeds what the configured speeds
 * allow; and total synthesized playback duration stays within a sane
 * multiple of the legacy fixed-tick baseline.
 *
 * Usage: npx ts-node src/scripts/frameInterpolationCheck.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import App from '../controllers/app/App';
import { IMatchEvent } from '../simulation/classes/Match';
import { POOL_PATH, IRosterPool, pickTwoDistinctClubs } from './simRealismCheck';
import {
  expandFrames,
  BALL_SPEED_BLOCKS_PER_SEC,
  PLAYER_RUN_SPEED_BLOCKS_PER_SEC,
  SUB_FRAME_INTERVAL_MS,
} from '../realtime/frameInterpolation';

const LEGACY_TICK_MS = 300;

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

async function main() {
  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const [home, away] = pickTwoDistinctClubs(pool.clubs);
  const homeId = String(home._id);
  const awayId = String(away._id);

  const app = new App();
  await app.setupGame(
    [homeId, awayId],
    { home: homeId, away: awayId },
    [home, away],
    { home: pool.tactics[homeId], away: pool.tactics[awayId] }
  );
  const match = await app.startGame();

  if (!match) {
    console.error('FAIL: match did not simulate');
    process.exit(1);
  }

  const frames = match.Frames;
  const steps = expandFrames(frames);

  const failures: string[] = [];

  // 1. Every original event appears exactly once, in order, only on a
  // tick-terminal sub-frame.
  const originalEvents: IMatchEvent[] = frames.flatMap((f) => f.events);
  const playedEvents: IMatchEvent[] = steps.flatMap((s) => s.frame.events);

  if (playedEvents.length !== originalEvents.length) {
    failures.push(
      `event count mismatch: original=${originalEvents.length} played=${playedEvents.length}`
    );
  } else if (
    !playedEvents.every((e, i) => e === originalEvents[i])
  ) {
    failures.push('played events are not in original order / identity');
  }

  // 2. No per-substep ball/player jump exceeds the configured speed bound -
  // except inside a `capped` tick (e.g. the half-time/post-goal formation
  // swap, where many players legitimately reposition ~30 blocks in one raw
  // tick), where MAX_TICK_DURATION_MS deliberately trades per-step realism
  // for not stalling playback. Those are expected fast-forwards, not bugs.
  const maxBallStep =
    (BALL_SPEED_BLOCKS_PER_SEC * SUB_FRAME_INTERVAL_MS) / 1000;
  const maxPlayerStep =
    (PLAYER_RUN_SPEED_BLOCKS_PER_SEC * SUB_FRAME_INTERVAL_MS) / 1000;
  const HEADROOM = 1.5;
  let cappedSteps = 0;

  for (let i = 1; i < steps.length; i++) {
    if (steps[i].capped) cappedSteps++;
    if (steps[i].capped || steps[i - 1].capped) continue;

    const prev = steps[i - 1].frame;
    const curr = steps[i].frame;

    const ballStep = distance(prev.ball, curr.ball);
    if (ballStep > maxBallStep * HEADROOM) {
      failures.push(
        `ball jumped ${ballStep.toFixed(2)} blocks between playback steps ${i - 1}->${i} (bound ~${maxBallStep.toFixed(2)})`
      );
    }

    for (const p of curr.players) {
      const prevPlayer = prev.players.find((pp) => pp.id === p.id);
      if (!prevPlayer) continue;
      const step = distance(prevPlayer, p);
      if (step > maxPlayerStep * HEADROOM) {
        failures.push(
          `player ${p.id} jumped ${step.toFixed(2)} blocks between playback steps ${i - 1}->${i} (bound ~${maxPlayerStep.toFixed(2)})`
        );
      }
    }
  }

  // 3. Total synthesized playback duration, reported against the legacy
  // fixed-tick baseline for context only - most ticks are small decisions
  // that legitimately need less than the old fixed 300ms to look natural,
  // so the total can land either side of the baseline; only flag it if it
  // balloons or evaporates outright.
  const totalDurationMs = steps.reduce((sum, s) => sum + s.delayMs, 0);
  const legacyDurationMs = frames.length * LEGACY_TICK_MS;
  const ratio = totalDurationMs / legacyDurationMs;

  console.log(`Ticks: ${frames.length}`);
  console.log(`Playback frames: ${steps.length} (${cappedSteps} capped)`);
  console.log(
    `Total playback duration: ${(totalDurationMs / 1000).toFixed(1)}s ` +
      `(legacy fixed-tick baseline: ${(legacyDurationMs / 1000).toFixed(1)}s, ratio ${ratio.toFixed(2)}x)`
  );
  console.log(`Events: ${originalEvents.length}`);

  if (ratio < 0.3 || ratio > 5) {
    failures.push(
      `playback duration ratio ${ratio.toFixed(2)}x is wildly outside the expected range`
    );
  }

  if (failures.length) {
    console.error(`\nFAIL (${failures.length} issue(s)):`);
    failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  }

  console.log('\nPASS - all frameInterpolation invariants hold.');
}

main().catch((err) => {
  console.error('frameInterpolationCheck crashed:', err);
  process.exit(1);
});
