<template>
  <div v-if="settings" class="year-progress">
    <div class="d-flex justify-space-between text-caption mb-1">
      <span class="font-weight-bold">Year {{ settings.currentYear }}</span>
      <span class="text-medium-emphasis">Day {{ settings.dayOfYear }} of {{ settings.yearLengthDays }}</span>
    </div>
    <div class="yp-track">
      <div
        v-for="(w, i) in settings.transferWindows"
        :key="`w${i}`"
        class="yp-window"
        :style="span(w.fromDay, w.toDay)"
        :title="`Transfer window: days ${w.fromDay}-${w.toDay}`"
      ></div>
      <div
        v-for="(b, i) in bands"
        :key="`b${i}`"
        class="yp-band"
        :style="{ ...span(b.from, b.to), background: b.color }"
        :title="b.title"
      ></div>
      <div class="yp-now" :style="{ left: pct(settings.dayOfYear) }"></div>
    </div>
    <div v-if="windowOpen" class="text-caption text-teal-lighten-2 mt-1">
      <v-icon size="12">mdi-swap-horizontal</v-icon> Transfer window open
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WorldSettings } from '@repo/api-contract';

/** Year N, today's position, transfer windows and (optionally) edition
 * windows drawn as bands, all on one bar. Bands use day-of-year. */
const props = withDefaults(
  defineProps<{
    settings: WorldSettings | null;
    bands?: { from: number; to: number; color: string; title: string }[];
  }>(),
  { bands: () => [] }
);

const pct = (day: number) => `${Math.min(100, Math.max(0, ((day - 1) / (props.settings?.yearLengthDays || 1)) * 100))}%`;
const span = (from: number, to: number) => ({
  left: pct(from),
  width: `${Math.max(0.5, ((to - from + 1) / (props.settings?.yearLengthDays || 1)) * 100)}%`,
});
const windowOpen = computed(() =>
  props.settings?.transferWindows.some(
    (w) => props.settings!.dayOfYear >= w.fromDay && props.settings!.dayOfYear <= w.toDay
  )
);
</script>

<style scoped>
.yp-track {
  position: relative;
  height: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.yp-window {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(38, 166, 154, 0.55);
}
.yp-band {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: 3px;
  opacity: 0.8;
}
.yp-now {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 3px;
  background: #ffc107;
  box-shadow: 0 0 6px #ffc107;
}
</style>
