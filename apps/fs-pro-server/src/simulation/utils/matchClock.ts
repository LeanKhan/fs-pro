/**
 * Milestone 16 (Simultaneous Intentions And Tick Loop) - "define
 * simulation tick length", formalized rather than newly invented: this
 * has been the engine's real tick granularity since Milestone 5
 * (Chunked Simulation) first exposed `{minute:N}` boundaries - previously
 * a bare `/2`/`*2`/`90`/`180` scattered independently across `Game.ts`
 * (the tick loop) and `Match.ts` (`captureFrame()`'s replay-frame half
 * number), with no single source tying the two together. Lives in its
 * own tiny module rather than being exported from `Game.ts` because
 * `Match.ts` needs it too and `Game.ts` already imports `Match` - `Match`
 * importing back from `Game.ts` would be circular.
 *
 * A finer, sub-second tick (the plan doc's own sketch, "1 tick = 1
 * simulated second") was considered and deliberately NOT adopted: every
 * formula tuned since Milestone 1 (shoot/pass distance thresholds,
 * pressure radii, phase transition windows, off-ball movement bias) is
 * calibrated against this exact cadence, and changing it would be the
 * same class of blanket recalibration risk already flagged (and
 * deferred) for the field grid's own resolution. Two ticks per minute
 * stays the real, load-bearing granularity; this just gives it a name.
 */
export const TICKS_PER_MINUTE = 2;
export const HALF_DURATION_MINUTES = 45;
export const MATCH_DURATION_MINUTES = HALF_DURATION_MINUTES * 2;
export const HALF_TIME_TICK = HALF_DURATION_MINUTES * TICKS_PER_MINUTE;
export const FULL_TIME_TICK = MATCH_DURATION_MINUTES * TICKS_PER_MINUTE;
