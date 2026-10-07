<template>
  <div ref="stageEl" class="stage"></div>
  <div class="bubbles">
    <button
      v-for="b in bubbles"
      :key="b.key"
      class="bubble job"
      :style="{ transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -100%)`, display: b.visible ? '' : 'none' }"
      @click="emit('tap', { kind: 'building', id: b.key }, null)"
    >
      <span v-html="icon('hammer')"></span>
      <div class="b-prog"><div :style="{ width: `${b.progress}%` }"></div></div>
      <span class="b-time">{{ b.time }}</span>
    </button>
    <button
      v-for="a in alertBubbles"
      :key="`alert-${a.key}`"
      class="bubble alert"
      :title="a.label"
      :style="{ transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -100%)`, display: a.visible ? '' : 'none' }"
      @click="emit('alert', a.key)"
    >
      <span v-html="icon(a.icon)"></span><b v-if="a.count">{{ a.count }}</b>
    </button>
    <button
      v-if="collectBubble"
      class="bubble collect"
      :class="{ full: collectBubble.full, coach: collectBubble.coach }"
      :title="collectBubble.full ? 'The till is full: collect your takings' : 'Collect the club shop takings'"
      data-coach="collect"
      :style="{ transform: `translate(${collectBubble.x}px, ${collectBubble.y}px) translate(-50%, -100%)`, display: collectBubble.visible ? '' : 'none' }"
      @click="emit('collect')"
    >
      <span v-html="icon('coins')"></span><b>+{{ collectBubble.amount }}</b>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { CampusBuilding, Placed } from '@repo/api-contract';
import { formatClock } from '@/composables/use-club-game';
import { icon } from './icons';
import type { CityVariant } from './scene/terrain';
import { World, type CampusView, type Pick } from './scene/world';

const props = defineProps<{
  view: CampusView | null;
  variant: CityVariant;
  selected: string | null;
  /** Move mode: the building being moved, where it would go, and whether it fits. */
  ghost: { key: CampusBuilding; at: Placed; valid: boolean } | null;
  /** Running upgrades: start and end times (ms) by asset type. */
  timers: Record<string, { start: number; end: number }>;
  /** Things needing attention, by building key or city place id. */
  alerts: Record<string, { icon: string; label: string; count?: number }>;
  nowMs: number;
  /** The shop's coin bubble: over which building, how much, and whether the till is full. */
  collector?: { key: string; amount: number; full: boolean; coach?: boolean } | null;
  /** Stop drawing (e.g. while the Matchzone covers the campus). */
  suspended?: boolean;
}>();
const emit = defineEmits<{
  (e: 'tap', pick: Pick, ground: { x: number; z: number } | null): void;
  (e: 'hover', ground: { x: number; z: number }): void;
  (e: 'alert', key: string): void;
  (e: 'collect'): void;
}>();

const stageEl = ref<HTMLElement | null>(null);
const world = shallowRef<World | null>(null);
const bubbles = ref<{ key: string; x: number; y: number; visible: boolean; progress: number; time: string }[]>([]);
const alertBubbles = ref<{ key: string; x: number; y: number; visible: boolean; icon: string; label: string; count?: number }[]>([]);
const collectBubble = ref<{ x: number; y: number; visible: boolean; amount: string; full: boolean; coach: boolean } | null>(null);
let raf = 0;
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.floor(n / 1e3)}k` : Math.floor(n).toLocaleString('en-US'));

onMounted(() => {
  const w = new World(stageEl.value!, props.variant);
  w.onTap = (pick, g) => emit('tap', pick, g ? { x: g.x, z: g.z } : null);
  w.onHover = (g) => g && emit('hover', { x: g.x, z: g.z });
  world.value = w;
  if (props.view) w.sync(props.view);
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (props.suspended) return;
    w.render();
    bubbles.value = Object.entries(props.timers).flatMap(([key, t]) => {
      const a = w.anchor(key);
      if (!a) return [];
      const p = w.project(a);
      const progress = Math.min(100, Math.max(0, ((props.nowMs - t.start) / Math.max(t.end - t.start, 1)) * 100));
      return [{ key, x: p.x, y: p.y, visible: p.visible, progress, time: formatClock(Math.max(0, Math.ceil((t.end - props.nowMs) / 1000))) }];
    });
    alertBubbles.value = Object.entries(props.alerts).flatMap(([key, a]) => {
      const at = w.anchor(key);
      if (!at) return [];
      const p = w.project(at);
      // Sit above the timer bubble when the building is also upgrading.
      return [{ key, ...a, x: p.x, y: p.y - (props.timers[key] ? 46 : 0), visible: p.visible }];
    });
    const c = props.collector;
    const at = c && c.amount >= 1 ? w.anchor(c.key) : null;
    if (c && at) {
      const p = w.project(at);
      const stacked = (props.timers[c.key] ? 46 : 0) + (props.alerts[c.key] ? 46 : 0);
      collectBubble.value = { x: p.x, y: p.y - stacked, visible: p.visible, amount: short(c.amount), full: c.full, coach: !!c.coach };
    } else collectBubble.value = null;
  };
  raf = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  world.value?.dispose();
});

watch(() => props.view, (v) => v && world.value?.sync(v), { deep: true });
watch(() => props.selected, (k) => world.value?.select(k));
watch(
  () => props.ghost,
  (g) => {
    world.value?.setGhost(g?.key ?? null, g?.at, g?.valid);
    world.value?.setHidden(g?.key ?? null);
  },
  { deep: true }
);

defineExpose({
  focus: (x: number, z: number) => world.value?.focus(x, z),
  playArrival: (colors: [string, string]) => world.value?.playArrival(colors) ?? Promise.resolve(),
  setBillboard: (lines: string[]) => world.value?.setBillboard(lines),
  playDeparture: (colors: [string, string]) => world.value?.playDeparture(colors) ?? Promise.resolve(),
  burst: (key: string, kind: 'coins' | 'confetti') => world.value?.burst(key, kind),
  /** Where a building sits on screen (CSS px within the stage), for HUD effects. */
  screenOf: (key: string) => {
    const w = world.value;
    const a = w?.anchor(key);
    return w && a ? w.project(a) : null;
  },
});
</script>
