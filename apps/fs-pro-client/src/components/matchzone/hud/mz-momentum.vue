<template>
  <div
    ref="el"
    class="mz-momentum"
    role="slider"
    aria-label="Match timeline"
    :aria-valuenow="Math.round(minute)"
    aria-valuemin="0"
    aria-valuemax="90"
    tabindex="0"
    @pointerdown="down"
    @keydown.left.prevent="emit('seek', Math.max(0, minute - 5))"
    @keydown.right.prevent="emit('seek', Math.min(90, minute + 5))"
  >
    <svg viewBox="0 0 900 100" preserveAspectRatio="none" class="mz-momentum__chart">
      <rect x="0" y="0" width="900" height="100" rx="10" class="bg" />
      <line x1="450" y1="6" x2="450" y2="94" class="half" />
      <line x1="0" y1="50" x2="900" y2="50" class="mid" />
      <!-- xG per five minutes: home above the line, away below. -->
      <rect
        v-for="(v, i) in momentum.home"
        :key="'h' + i"
        :x="i * 50 + 6"
        :y="50 - bar(v)"
        width="38"
        :height="bar(v)"
        rx="5"
        :fill="homeColor"
        :opacity="(i + 1) * 5 <= minute + 5 ? 1 : 0.28"
      />
      <rect
        v-for="(v, i) in momentum.away"
        :key="'a' + i"
        :x="i * 50 + 6"
        y="50"
        width="38"
        :height="bar(v)"
        rx="5"
        :fill="awayColor"
        :opacity="(i + 1) * 5 <= minute + 5 ? 1 : 0.28"
      />
      <rect :x="0" y="0" :width="(minute / 90) * 900" height="100" rx="10" class="played" />
    </svg>
    <!-- Markers sit in HTML so they keep their shape at any width. -->
    <span
      v-for="(m, i) in markers"
      :key="i"
      class="mz-momentum__marker"
      :class="[m.kind, m.side]"
      :style="{ left: `${(m.minute / 90) * 100}%` }"
      :title="m.title"
    >
      <i v-if="m.kind === 'goal'" v-html="ball" />
      <i v-else class="card" />
    </span>
    <span class="mz-momentum__head" :style="{ left: `${(minute / 90) * 100}%` }"><b>{{ Math.floor(minute) }}'</b></span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { icon } from '@/components/cozy/icons';
import type { Side, TimelineEvent } from '../playback';

const props = defineProps<{
  minute: number;
  momentum: { home: number[]; away: number[] };
  events: TimelineEvent[];
  homeColor: string;
  awayColor: string;
  names: Record<string, string>;
}>();
const emit = defineEmits<{ (e: 'seek', minute: number): void }>();

const el = ref<HTMLElement | null>(null);
const ball = icon('ball');
const peak = computed(() => Math.max(0.6, ...props.momentum.home, ...props.momentum.away));
const bar = (v: number) => (v <= 0 ? 0 : 6 + (v / peak.value) * 38);

const markers = computed(() =>
  props.events
    .filter((e) => e.kind === 'goal' || e.kind === 'penalty-goal' || e.kind === 'yellow' || e.kind === 'red')
    .map((e) => ({
      minute: e.minute,
      side: (e.side ?? 'home') as Side,
      kind: e.kind === 'penalty-goal' ? 'goal' : e.kind,
      title: `${e.minute}' ${e.playerId ? props.names[e.playerId] ?? '' : ''}`,
    }))
);

function at(clientX: number) {
  const r = el.value!.getBoundingClientRect();
  return Math.max(0, Math.min(90, ((clientX - r.left) / r.width) * 90));
}
function down(e: PointerEvent) {
  const target = e.currentTarget as HTMLElement;
  try {
    target.setPointerCapture(e.pointerId);
  } catch {
    /* synthetic pointer */
  }
  emit('seek', at(e.clientX));
  const move = (ev: PointerEvent) => emit('seek', at(ev.clientX));
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}
</script>

<style scoped lang="scss">
.mz-momentum {
  position: relative;
  height: 54px;
  cursor: pointer;
  touch-action: none;
  outline: none;
  &:focus-visible .mz-momentum__chart {
    box-shadow: 0 0 0 3px #3a8ee0;
  }
}
.mz-momentum__chart {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 12px;
  border: 2px solid #e2cc9c;
  .bg {
    fill: #fffaf0;
  }
  .half {
    stroke: #c9a46a;
    stroke-width: 3;
    stroke-dasharray: 6 6;
  }
  .mid {
    stroke: #eadbb8;
    stroke-width: 2;
  }
  .played {
    fill: rgba(245, 184, 46, 0.12);
  }
}
.mz-momentum__marker {
  position: absolute;
  transform: translateX(-50%);
  pointer-events: none;
  &.home {
    top: -11px;
  }
  &.away {
    bottom: -11px;
  }
  i {
    display: block;
  }
  :deep(.ic) {
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.3));
  }
  .card {
    width: 11px;
    height: 15px;
    border-radius: 2px;
    border: 1.5px solid rgba(0, 0, 0, 0.35);
  }
  &.yellow .card {
    background: #f5c62e;
  }
  &.red .card {
    background: #e5402f;
  }
}
.mz-momentum__head {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 3px;
  margin-left: -1.5px;
  background: #5e3b22;
  border-radius: 2px;
  pointer-events: none;
  b {
    position: absolute;
    top: -22px;
    left: 50%;
    transform: translateX(-50%);
    padding: 0 6px;
    border-radius: 8px;
    background: #5e3b22;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
}
</style>
