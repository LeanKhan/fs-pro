/**
 * The countdown primitive (docs/coc-mapping/08 §4.1, 04 §12).
 *
 * The server is the clock; the client only displays. Every timer in the game —
 * collectors, builders, Rest Window, Warm-up Guard, Form Bonus, ladder reset,
 * Season, Festival Weekend — is an *absolute UTC timestamp* (`readyAt`,
 * `nextResetAt`, `windowClosesAt`, `shieldUntil`) shipped next to the server's
 * own `now`. The client derives the countdown from `serverNow` vs the
 * timestamp, so a wrong device clock or a backgrounded tab cannot desync it.
 *
 * This module is the pure, deterministic core: no Vue, no `Date.now()`, no
 * `setInterval`. That keeps it trivially unit-testable and keeps the device
 * clock out of the maths — the *only* thing the local clock may ever supply is
 * a monotonic *delta* between two samples (see `remainingMs`).
 */

/** A wall clock returning milliseconds since the Unix epoch. */
export type Clock = () => number;

/** An absolute time as the server sends it: ISO-8601 or epoch milliseconds. */
export type Instant = string | number;

/** Parse an `Instant` to epoch ms, or `null` when it is missing/invalid. */
function toMs(value: Instant | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * What one server clock sample means for a target time: the target's absolute
 * deadline, and how far away it was *at the instant the server read its clock*.
 * Anchoring to `serverNow` (never the device) is the whole point (04 §12).
 */
export interface CountdownAnchor {
  /** The absolute deadline (epoch ms); `null` only in the degenerate case. */
  targetMs: number | null;
  /** Milliseconds left at the sample: `targetMs - serverNowMs` (may be ≤ 0). */
  remainingAtSyncMs: number;
}

/**
 * Anchor a target to a server clock sample. Returns `null` while either side is
 * missing or unparseable, so callers can distinguish "not loaded yet" from
 * "ready".
 */
export function anchorCountdown(
  at: Instant | null | undefined,
  serverNow: Instant | null | undefined
): CountdownAnchor | null {
  const targetMs = at === null || at === undefined ? null : toMs(at);
  const nowMs =
    serverNow === null || serverNow === undefined ? null : toMs(serverNow);
  if (targetMs === null || nowMs === null) return null;
  return { targetMs, remainingAtSyncMs: targetMs - nowMs };
}

/**
 * Milliseconds remaining, given how much *local* time has elapsed since the
 * server sample was taken. Only the delta matters, so a device clock that is
 * wrong by any fixed offset yields the same answer. Floored at zero so a past
 * deadline never reads as "negative time left".
 */
export function remainingMs(
  anchor: CountdownAnchor | null,
  elapsedSinceSyncMs: number
): number {
  if (!anchor || anchor.targetMs === null) return 0;
  const elapsed = elapsedSinceSyncMs > 0 ? elapsedSinceSyncMs : 0;
  return Math.max(0, anchor.remainingAtSyncMs - elapsed);
}

/**
 * The human label for a remaining duration:
 * `45s`, `12m`, `3h 12m`, `2d 4h`, `18d`, and `ready` at (or past) zero.
 *
 * Seconds round *up* so a label only reads `ready` at the deadline, never a
 * second early; larger units are dropped once a smaller one carries the
 * meaning (an exact `2d` shows as `2d`, not `2d 0h`).
 */
export function formatRemaining(ms: number): string {
  if (!(ms > 0)) return 'ready';
  const total = Math.max(1, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

/**
 * One-shot label straight off a single server sample — the pure equivalent of
 * the composable before any local ticking. `null`/`''` when the sample has not
 * landed yet.
 */
export function formatCountdown(
  at: Instant | null | undefined,
  serverNow: Instant | null | undefined
): string {
  const anchor = anchorCountdown(at, serverNow);
  return anchor ? formatRemaining(anchor.remainingAtSyncMs) : '';
}

/**
 * The same formatter for the server's *legacy seconds* fields — the timers the
 * play/campus contracts still ship as a duration rather than an absolute UTC
 * timestamp (`cooldownSeconds`, `challenge.secondsLeft`, `startsInSeconds`,
 * `upgrade.secondsLeft`, `shop.secondsToFull`). It is a thin seconds→ms adapter
 * over {@link formatRemaining}, so there is still exactly one formatting rule;
 * those fields are the ones flagged in `docs/coc-mapping/09-OPEN-WORK.md`
 * (OW-P17) as still missing an absolute timestamp.
 */
export function formatRemainingSeconds(seconds: number): string {
  return formatRemaining(seconds * 1000);
}
