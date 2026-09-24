<template>
  <world-scene
    ref="sceneRef"
    :width="layout.width"
    :height="layout.height"
    :scene="`/world/${layout.scene}`"
    :ground="manifest.has('campus/ground.jpg') ? '/world/campus/ground.jpg' : null"
    :objects="objects"
    :selected="selected"
    :debug="debug"
    :night="night"
    :weather="weather"
    :label="`${clubName || 'Club'} campus`"
    @select="emit('select', $event)"
  >
    <template #under="{ pct }">
      <template v-if="layout.variant === 'city'">
        <img
          v-for="(s, i) in decor"
          :key="`d${i}`"
          :src="s.src"
          class="cs-sprite"
          :style="{ left: pct(s.left, 'x'), top: pct(s.top, 'y'), width: pct(s.w, 'x') }"
          alt=""
          draggable="false"
        />
        <img
          v-for="(s, i) in signCrests"
          :key="`c${i}`"
          :src="s.src"
          class="cs-sprite cs-crest"
          :style="{ left: pct(s.left, 'x'), top: pct(s.top, 'y'), width: pct(s.w, 'x') }"
          alt=""
          draggable="false"
        />
      </template>
      <campus-fans :fans-count="matchDay ? Math.round((fansCount ?? 120) * 1.8) : fansCount" />
    </template>
    <template #over>
      <div v-if="matchDay" class="cs-banner">⚽ Match day{{ matchDay === true ? '' : ` vs ${matchDay}` }}</div>
    </template>
  </world-scene>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AssetState } from '@repo/api-contract';
import CampusFans from '@/components/game/campus-fans.vue';
import WorldScene from './world-scene.vue';
import { DECOR, SIGNS, SIGN_PANELS, placeSprite } from './campus-decor';
import { layoutFor, variantFor } from './campus-plots';
import { useWorldManifest } from './manifest';
import type { SceneObject } from './types';

/** A club's campus: its layout variant, a plate per facility at its Tier
 * band, and Tier / building status on the pins (never more). */
const props = withDefaults(
  defineProps<{
    assets: AssetState[];
    clubId: string;
    campusLayout?: string | null;
    clubCode?: string | null;
    clubName?: string | null;
    selected?: string | null;
    nowMs: number;
    debug?: boolean;
    fansCount?: number;
    /** true, or the opponent's name, on a day the club plays. */
    matchDay?: boolean | string;
  }>(),
  { campusLayout: null, clubCode: null, clubName: null, selected: null, debug: false, fansCount: 120, matchDay: false }
);
const emit = defineEmits<{ (e: 'select', key: string): void }>();

const manifest = useWorldManifest();
const sceneRef = ref<InstanceType<typeof WorldScene> | null>(null);
const layout = computed(() => layoutFor(variantFor(props.clubId, props.campusLayout), manifest.has));

function clock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
}

const objects = computed<SceneObject[]>(() =>
  layout.value.plots.map((p) => {
    const asset = props.assets.find((a) => a.type === p.key);
    const tier = asset?.level ?? 0;
    const facility = p.key !== 'office' && p.key !== 'dugout';
    let progress: number | null = null;
    let status: string | null = null;
    if (asset?.upgrade) {
      const start = new Date(asset.upgrade.startAt).getTime();
      const end = new Date(asset.upgrade.completeAt).getTime();
      progress = Math.min(100, Math.max(0, ((props.nowMs - start) / Math.max(end - start, 1)) * 100));
      status = clock(Math.max(Math.ceil((end - props.nowMs) / 1000), 0));
    }
    return {
      id: p.key,
      label: p.title,
      icon: p.icon,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      z: p.z,
      pin: p.pin,
      hit: p.hit,
      src: manifest.plateFor(p.key, tier),
      badge: facility ? `Tier ${tier}` : null,
      status,
      progress,
      scaffold: !!asset?.upgrade,
      glow: !!props.matchDay && p.key === 'stands',
    };
  })
);

const decor = computed(() => [...DECOR, ...SIGNS].map(placeSprite).sort((a, b) => a.y - b.y));
const signCrests = computed(() => {
  if (!props.clubCode) return [];
  const src = `/club-icons/${props.clubCode}.svg`;
  return SIGNS.map((s) => {
    const board = placeSprite(s);
    const panel = SIGN_PANELS[s.img]!;
    return { src, left: board.left + panel.left * board.w, top: board.top + panel.top * board.h, w: panel.width * board.w };
  });
});

// Day / night from the local clock: dusk from 18:00, night 21:00–05:00.
const hour = new Date().getHours() + new Date().getMinutes() / 60;
const night = computed(() => {
  void props.nowMs;
  if (hour >= 21 || hour < 5) return 1;
  if (hour >= 18) return (hour - 18) / 3;
  if (hour < 7) return (7 - hour) / 2;
  return 0;
});
// One weather per calendar day, stable across reloads.
const weather = computed<'rain' | 'overcast' | null>(() => {
  const d = new Date();
  const seed = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate() + props.clubId.length) % 10;
  return seed === 0 ? 'rain' : seed < 3 ? 'overcast' : null;
});

defineExpose({ focus: (x: number, y: number, z?: number) => sceneRef.value?.focus(x, y, z) });
</script>

<style scoped>
.cs-sprite {
  position: absolute;
  height: auto;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.35));
}
.cs-crest {
  filter: none;
}
.cs-banner {
  position: absolute;
  left: 50%;
  top: 4%;
  transform: translateX(-50%) scale(var(--inv, 1));
  padding: 6px 16px;
  border-radius: 999px;
  font-weight: 800;
  color: #1a1a1a;
  background: linear-gradient(90deg, #fbbf24, #fde68a);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}
</style>
