import { IMatchFrame, IMatchFramePlayer } from '../simulation/classes/Match';

/**
 * `Game.gameLoop` resolves exactly one decision per tick - a whole
 * pass/shot/interception moves the ball or a player the full distance in a
 * single tick, and `Match.captureFrame()` only ever records the before/after
 * position, never anything in between (see that method's doc comment). That
 * "one decision per tick" model is fine as the simulation's ground truth for
 * AI/stats/determinism, but played back verbatim it looks like teleportation.
 *
 * This module is a pure post-processing pass over an already-finished
 * `Frames` array (never touches the decision engine) that synthesizes
 * in-between sub-frames for PLAYBACK ONLY, with each tick's on-screen
 * duration derived from how far the fastest-moving entity that tick actually
 * travelled, at a real speed. `matchBroadcaster.ts` is the only caller - the
 * persisted `Frames` array (used for stats/rewatch storage) is untouched.
 */

export interface IPlaybackStep {
  frame: IMatchFrame;
  /** Wait this long after emitting `frame` before emitting the next step. */
  delayMs: number;
  /** True when this step's tick needed more than `MAX_TICK_DURATION_MS` to
   * cover at real speed (e.g. the half-time/post-goal formation swap, where
   * many players reposition ~30 blocks in one tick) and got compressed into
   * the cap instead - so its per-step speed is deliberately faster than
   * `PLAYER_RUN_SPEED_BLOCKS_PER_SEC`/`BALL_SPEED_BLOCKS_PER_SEC`, on
   * purpose, to keep playback from stalling. Exposed so callers (e.g. a
   * verification script) can tell an expected fast-forward apart from a
   * real regression. */
  capped: boolean;
}

// 1 block ≈ 3.2m (the pitch is rendered as a 33x21 block grid representing
// a ~105x68m pitch - see DEFAULT_X_BLOCKS/DEFAULT_Y_BLOCKS in live-pitch.vue).
export const BALL_SPEED_BLOCKS_PER_SEC = 26;
export const PLAYER_RUN_SPEED_BLOCKS_PER_SEC = 8;
// Exported for future refinement (e.g. distinguishing walk/run pace) - not
// yet used in the duration calculation below.
export const PLAYER_WALK_SPEED_BLOCKS_PER_SEC = 3;

export const SUB_FRAME_INTERVAL_MS = 60;
export const MIN_TICK_DURATION_MS = 120;
export const MAX_TICK_DURATION_MS = 1200;

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpPlayer(
  prev: IMatchFramePlayer | undefined,
  curr: IMatchFramePlayer,
  t: number
): IMatchFramePlayer {
  if (!prev) return curr;

  return {
    ...curr,
    x: lerp(prev.x, curr.x, t),
    y: lerp(prev.y, curr.y, t),
  };
}

function neededTickDurationMs(prev: IMatchFrame, curr: IMatchFrame): number {
  const ballDist = distance(prev.ball, curr.ball);

  let maxPlayerDist = 0;
  for (const p of curr.players) {
    const prevPlayer = prev.players.find((pp) => pp.id === p.id);
    if (!prevPlayer) continue;
    maxPlayerDist = Math.max(maxPlayerDist, distance(prevPlayer, p));
  }

  return Math.max(
    (ballDist / BALL_SPEED_BLOCKS_PER_SEC) * 1000,
    (maxPlayerDist / PLAYER_RUN_SPEED_BLOCKS_PER_SEC) * 1000
  );
}

function expandTick(
  prev: IMatchFrame | null,
  curr: IMatchFrame
): IPlaybackStep[] {
  if (!prev) {
    return [{ frame: curr, delayMs: MIN_TICK_DURATION_MS, capped: false }];
  }

  const neededMs = neededTickDurationMs(prev, curr);
  const duration = Math.min(
    MAX_TICK_DURATION_MS,
    Math.max(MIN_TICK_DURATION_MS, neededMs)
  );
  const capped = neededMs > MAX_TICK_DURATION_MS;
  const steps = Math.max(1, Math.ceil(duration / SUB_FRAME_INTERVAL_MS));
  const delayMs = duration / steps;

  const out: IPlaybackStep[] = [];
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const isLast = k === steps;

    out.push({
      frame: {
        tick: curr.tick,
        minute: curr.minute,
        half: curr.half,
        ball: {
          x: lerp(prev.ball.x, curr.ball.x, t),
          y: lerp(prev.ball.y, curr.ball.y, t),
        },
        players: curr.players.map((p) =>
          lerpPlayer(
            prev.players.find((pp) => pp.id === p.id),
            p,
            t
          )
        ),
        // The engine resolves discrete outcomes (goals, cards, tackles...)
        // instantly - there's no genuine in-between state, so only the real
        // terminal frame of the tick carries them. Synthesized sub-frames
        // in front of it get none, so nothing fires early or twice.
        events: isLast ? curr.events : [],
      },
      delayMs,
      capped,
    });
  }

  return out;
}

/** Expands a fully-simulated match's raw per-tick `Frames` into a longer,
 * smoothly-interpolated playback sequence. Pure - does not mutate `frames`. */
export function expandFrames(frames: IMatchFrame[]): IPlaybackStep[] {
  const out: IPlaybackStep[] = [];
  let prev: IMatchFrame | null = null;

  for (const curr of frames) {
    out.push(...expandTick(prev, curr));
    prev = curr;
  }

  return out;
}
