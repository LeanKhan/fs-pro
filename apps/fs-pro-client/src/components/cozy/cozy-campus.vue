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
  nowMs: number;
}>();
const emit = defineEmits<{
  (e: 'tap', pick: Pick, ground: { x: number; z: number } | null): void;
  (e: 'hover', ground: { x: number; z: number }): void;
}>();

const stageEl = ref<HTMLElement | null>(null);
const world = shallowRef<World | null>(null);
const bubbles = ref<{ key: string; x: number; y: number; visible: boolean; progress: number; time: string }[]>([]);
let raf = 0;

onMounted(() => {
  const w = new World(stageEl.value!, props.variant);
  w.onTap = (pick, g) => emit('tap', pick, g ? { x: g.x, z: g.z } : null);
  w.onHover = (g) => g && emit('hover', { x: g.x, z: g.z });
  world.value = w;
  if (props.view) w.sync(props.view);
  const loop = () => {
    w.render();
    bubbles.value = Object.entries(props.timers).flatMap(([key, t]) => {
      const a = w.anchor(key);
      if (!a) return [];
      const p = w.project(a);
      const progress = Math.min(100, Math.max(0, ((props.nowMs - t.start) / Math.max(t.end - t.start, 1)) * 100));
      return [{ key, x: p.x, y: p.y, visible: p.visible, progress, time: formatClock(Math.max(0, Math.ceil((t.end - props.nowMs) / 1000))) }];
    });
    raf = requestAnimationFrame(loop);
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
  playDeparture: (colors: [string, string]) => world.value?.playDeparture(colors) ?? Promise.resolve(),
});
</script>
