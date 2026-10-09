<template>
  <span class="op-countup">{{ format(display) }}</span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * A count-up number for the program's "wow" moments (threejs-gameplay-systems:
 * juice) — the starting-balance reveal, the fee dropping after an interview.
 * Reduced motion shows the final value instantly.
 */
const props = withDefaults(
  defineProps<{
    value: number;
    duration?: number;
    format?: (n: number) => string;
    start?: boolean;
  }>(),
  { duration: 950, start: true }
);

const display = ref(0);
let raf = 0;

function format(n: number): string {
  return props.format ? props.format(n) : Math.round(n).toLocaleString('en-US');
}

function run(): void {
  cancelAnimationFrame(raf);
  if (!props.start) {
    display.value = 0;
    return;
  }
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    display.value = props.value;
    return;
  }
  const to = props.value;
  const t0 = performance.now();
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / props.duration);
    const eased = 1 - Math.pow(1 - p, 3);
    display.value = to * eased;
    if (p < 1) raf = requestAnimationFrame(tick);
    else display.value = to;
  };
  raf = requestAnimationFrame(tick);
}

onMounted(run);
watch(() => [props.value, props.start], run);
onBeforeUnmount(() => cancelAnimationFrame(raf));

defineExpose({ replay: run });
</script>

<style scoped>
.op-countup {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
</style>
