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
  <!-- The advisor's 3D building marker: a world-space anchor projected every
       frame, drawn over the scene but under PLAY/dock/HUD (z-index 6, §4). -->
  <div
    v-if="advisorMarker && advisorMarker.visible"
    class="adv-marker"
    data-testid="advisor-marker"
    :style="{ transform: `translate(${advisorMarker.x}px, ${advisorMarker.y}px)` }"
    aria-hidden="true"
  >
    <svg viewBox="0 0 48 60" width="48" height="60">
      <ellipse class="ring" cx="24" cy="46" rx="15" ry="6" />
      <path class="chev" d="M24 2 8 18h32z" />
      <path class="stem" d="M24 16v22" />
    </svg>
  </div>
  <!-- One advisor component, docked bottom-left. -->
  <CozyAdvisor
    :club-id="advisorClubId"
    :suspended="suspended"
    :marker="advisorMarker"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { CampusBuilding, Placed } from '@repo/api-contract';
import { formatClock } from '@/composables/use-club-game';
import { useStore } from '@/store';
import { icon } from './icons';
import CozyAdvisor from './advisor/CozyAdvisor.vue';
import { useAdvisorStore } from './advisor/use-advisor';
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

// --- Advisor (L10): own-club gate + the projected 3D building marker --------
const route = useRoute();
const store = useStore();
const advisorStore = useAdvisorStore();
const advisorMarker = ref<{ x: number; y: number; visible: boolean } | null>(null);
const advisorClubId = computed(() => {
  const id = String(route.params.clubId ?? '');
  if (!id) return null;
  const clubs = store.user?.clubs ?? [];
  return clubs.some((c) => (typeof c === 'string' ? c === id : c._id === id)) ? id : null;
});
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

    // The advisor's world-space marker (gold ring + chevron), cleared by the
    // store after 6s or when the line advances.
    const target = advisorStore.pointBuilding;
    const anchor = target && advisorStore.markerLive(Date.now()) ? w.anchor(target) : null;
    const mp = anchor ? w.project(anchor) : null;
    advisorMarker.value = mp && mp.visible ? { x: mp.x, y: mp.y, visible: true } : null;
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

<style scoped>
/* The advisor's projected building marker (L10, ADVISOR-SPEC §3). Sits above
   the campus scene and building bubbles (0) but below PLAY/dock/HUD and the
   drawer (25) / modals (20). One marker at a time. */
.adv-marker {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 6;
  width: 48px;
  height: 60px;
  margin: -58px 0 0 -24px; /* the anchor sits just above the roof */
  pointer-events: none;
  filter: drop-shadow(0 3px 2px rgba(70, 40, 15, 0.35));
}
.adv-marker svg {
  display: block;
  overflow: visible;
}
.adv-marker .ring {
  fill: none;
  stroke: #f5b82e;
  stroke-width: 4;
  stroke-dasharray: 5 4;
}
.adv-marker .chev {
  fill: #f5b82e;
  stroke: #b5860f;
  stroke-width: 2;
  stroke-linejoin: round;
}
.adv-marker .stem {
  stroke: #b5860f;
  stroke-width: 3;
  stroke-linecap: round;
}
@media (prefers-reduced-motion: no-preference) {
  .adv-marker .ring {
    animation: adv-ring 1.6s ease-in-out infinite;
  }
}
@keyframes adv-ring {
  50% {
    opacity: 0.45;
  }
}
</style>
