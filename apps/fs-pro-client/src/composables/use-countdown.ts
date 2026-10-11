import {
  computed,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue';
import {
  anchorCountdown,
  formatRemaining,
  remainingMs,
  type Clock,
  type Instant,
} from '@/helpers/countdown';

/**
 * Options for {@link useCountdown}.
 */
export interface UseCountdownOptions {
  /**
   * The local clock. Defaults to `Date.now`; injectable so the (cosmetic) tick
   * can be driven deterministically in tests, and so a device with a wrong
   * clock can be simulated. It is only ever used for *elapsed deltas* — the
   * countdown itself is anchored to `serverNow` (04 §12).
   */
  now?: Clock;
  /**
   * Fired once each time the countdown crosses to zero. Cosmetic: the item is
   * only truly done when the server says so (08 §4.1).
   */
  onDone?: () => void;
}

/**
 * The reactive countdown primitive: wraps the pure {@link anchorCountdown} /
 * {@link remainingMs} / {@link formatRemaining} core with Vue reactivity.
 *
 * It does not own a timer. The host (see `cozy-countdown.vue`) calls `tick()`
 * on its cosmetic interval; `tick` re-reads the injected clock and only ever
 * applies the elapsed delta. Re-anchoring happens automatically when `at` or
 * `serverNow` change (a fresh read or a realtime push), or on demand via
 * `resync`.
 */
export interface Countdown {
  /** `45s` / `3h 12m` / `2d 4h` / `18d` / `ready`; `''` until the sample lands. */
  label: ComputedRef<string>;
  /** Milliseconds left right now, floored at zero. */
  remaining: ComputedRef<number>;
  /** True once the sample says the deadline has passed. */
  ready: ComputedRef<boolean>;
  /** Re-read the local clock and recompute. Call on each cosmetic tick. */
  tick: () => void;
  /** Re-anchor to a fresh local sample (also runs when `at`/`serverNow` change). */
  resync: () => void;
}

export function useCountdown(
  at: MaybeRefOrGetter<Instant | null | undefined>,
  serverNow: MaybeRefOrGetter<Instant | null | undefined>,
  options: UseCountdownOptions = {}
): Countdown {
  const now = options.now ?? Date.now;

  const anchor = computed(() =>
    anchorCountdown(toValue(at), toValue(serverNow))
  );
  // Device ms when the current server sample was taken. Only differences from
  // this are used, so an incorrect absolute device clock cannot desync us.
  const syncedAtMs = ref(now());
  const elapsedMs = ref(0);
  let fired = false;

  const remaining = computed(() => remainingMs(anchor.value, elapsedMs.value));
  const ready = computed(() => anchor.value !== null && remaining.value <= 0);
  const label = computed(() =>
    anchor.value === null ? '' : formatRemaining(remaining.value)
  );

  /** Apply local time elapsed since the anchor and fire `onDone` once. */
  function tick() {
    elapsedMs.value = Math.max(0, now() - syncedAtMs.value);
    if (!fired && anchor.value !== null && remaining.value <= 0) {
      fired = true;
      options.onDone?.();
    }
  }

  /** Take a fresh local anchor (the server sample itself is unchanged). */
  function resync() {
    syncedAtMs.value = now();
    elapsedMs.value = 0;
    fired = false;
  }

  // A new server sample re-anchors: the moment the payload lands is the moment
  // `serverNow` is meaningful to the device.
  watch([() => toValue(at), () => toValue(serverNow)], resync);

  return { label, remaining, ready, tick, resync };
}
