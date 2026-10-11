<template>
  <span class="cd" :class="{ ready }">
    <span v-if="label && !ready" class="cd-label">{{ label }}</span>
    <b v-if="display" class="cd-value">{{ display }}</b>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useCountdown } from '@/composables/use-countdown';

/**
 * The one countdown renderer for the whole game (docs/coc-mapping/08 §4.1).
 *
 * It takes an **absolute UTC timestamp** and the server's `now` at the moment
 * that timestamp was read, and renders a human label (`45s`, `3h 12m`,
 * `2d 4h`, `18d`, `ready`). It never takes a duration or a game-day.
 *
 * Ticks are cosmetic: the label updates locally, but **the server is
 * authoritative for completion** — an item is only truly ready when the next
 * read (or a `campus:upgrade-complete`-style event) says so. `onDone` is a
 * best-effort local signal for optimistic UI, not a source of truth.
 *
 * Plain HTML/CSS with the cozy tokens — no Vuetify.
 */
const props = defineProps<{
  /** The absolute deadline (`readyAt` / `nextResetAt` / `shieldUntil` / `windowClosesAt`), ISO-8601. */
  at: string;
  /** The server clock at the moment `at` was read. The countdown derives from this, never the device. */
  serverNow: string;
  /** Optional muted prefix, e.g. "Upgrade in". */
  label?: string;
  /** Called once when the local tick reaches zero (cosmetic). */
  onDone?: () => void;
  /** Cosmetic tick period in milliseconds. Defaults to 1000. */
  intervalMs?: number;
}>();

const {
  label: text,
  ready,
  tick,
} = useCountdown(
  () => props.at,
  () => props.serverNow,
  { onDone: () => props.onDone?.() }
);

const display = computed(() => (ready.value ? 'ready' : text.value));

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick();
  timer = setInterval(tick, props.intervalMs ?? 1000);
});
onBeforeUnmount(() => timer && clearInterval(timer));
</script>

<style scoped>
.cd {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cd-label {
  color: var(--muted, #6f5940);
  font-size: 13px;
}
.cd-value {
  color: var(--ink, #4a3220);
  font-weight: 700;
}
.cd.ready .cd-value {
  color: var(--green-d, #2f8a1c);
}
</style>
