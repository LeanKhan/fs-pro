<template>
  <div
    ref="viewport"
    class="ws-viewport"
    :style="{ background: surround }"
    @wheel.prevent="handlers.onWheel"
    @pointerdown="handlers.onPointerDown"
    @pointermove="handlers.onPointerMove"
    @pointerup="handlers.onPointerEnd"
    @pointercancel="handlers.onPointerEnd"
    @click.capture="handlers.onClickCapture"
  >
    <div class="ws-map" :class="{ 'is-animated': pz.animate.value }" :style="[pz.mapStyle.value, { filter: sceneFilter }]">
      <img v-if="ground" class="ws-ground" :style="groundStyle" :src="ground" alt="" draggable="false" />
      <img v-if="scene" class="ws-scene" :class="{ 'is-faded': fadeEdges }" :src="scene" :alt="label" draggable="false" />
      <div v-else class="ws-scene ws-scene-blank" />

      <slot name="under" :pct="pct" />

      <!-- Plates and placeholders, ground layer first, then by y. -->
      <template v-for="o in drawn" :key="o.id">
        <img
          v-if="o.src"
          :src="o.src"
          class="ws-plate"
          :class="{ 'is-building': o.scaffold, 'is-selected': selected === o.id }"
          :style="boxStyle(o)"
          alt=""
          draggable="false"
          loading="lazy"
        />
        <div v-else class="ws-empty" :style="boxStyle(o)">
          <span>{{ o.label }}</span>
        </div>
        <div v-if="o.scaffold" class="ws-scaffold" :style="boxStyle(o)" />
        <div v-if="o.glow || night > 0.5" class="ws-glow" :style="glowStyle(o)" />
      </template>

      <slot name="over" :pct="pct" />

      <svg class="ws-hits" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none">
        <template v-for="o in objects" :key="o.id">
          <rect
            v-for="(b, i) in hitBoxes(o)"
            :key="i"
            :x="b[0]"
            :y="b[1]"
            :width="b[2]"
            :height="b[3]"
            rx="10"
            class="ws-hit"
            :class="{ 'is-selected': selected === o.id, 'is-debug': debug, 'is-building': o.scaffold }"
            @click="emit('select', o.id)"
          />
        </template>
      </svg>

      <button
        v-for="o in objects"
        :key="`pin-${o.id}`"
        type="button"
        class="ws-pin"
        :class="{ 'is-selected': selected === o.id }"
        :style="pinStyle(o)"
        :aria-label="[o.label, o.badge, o.status].filter(Boolean).join(', ')"
        @click="emit('select', o.id)"
      >
        <span v-if="o.progress != null" class="ws-progress">
          <span class="ws-progress-row"><span>🔨 {{ o.status }}</span></span>
          <v-progress-linear :model-value="o.progress" color="amber" height="6" rounded bg-color="rgba(0,0,0,.55)" />
        </span>
        <span class="ws-tag" :style="o.tint ? { borderColor: o.tint } : undefined">
          <img v-if="o.pinImage" :src="o.pinImage" class="ws-tag-img" alt="" @error="hideImg" />
          <span v-else-if="o.icon" class="ws-tag-icon">{{ o.icon }}</span>
          <span class="ws-tag-name">{{ o.label }}</span>
          <span v-if="o.badge" class="ws-tag-badge">{{ o.badge }}</span>
          <span v-if="o.status && o.progress == null" class="ws-tag-status">{{ o.status }}</span>
        </span>
      </button>
    </div>

    <div class="ws-weather" :class="weather ? `is-${weather}` : ''" />

    <div class="ws-controls" @pointerdown.stop @click.stop>
      <button type="button" title="Zoom in" @click="pz.zoomBy(1.4)">+</button>
      <button type="button" title="Zoom out" @click="pz.zoomBy(1 / 1.4)">&minus;</button>
      <button type="button" title="Reset view" @click="pz.resetView()">&#x2922;</button>
      <button type="button" :title="listOpen ? 'Hide list' : 'List view'" @click="listOpen = !listOpen">☰</button>
    </div>

    <div v-if="listOpen" class="ws-list" @pointerdown.stop @click.stop @wheel.stop>
      <div class="ws-list-title">{{ label }}</div>
      <button v-for="o in sortedList" :key="o.id" type="button" class="ws-list-item" @click="emit('select', o.id)">
        <span>{{ o.icon }} {{ o.label }}</span>
        <span class="ws-list-meta">{{ [o.badge, o.status].filter(Boolean).join(' · ') }}</span>
      </button>
    </div>

    <slot name="hud" :focus="pz.focus" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SceneObject } from './types';
import { usePanZoom } from './use-pan-zoom';

/**
 * Generic world scene (docs/WORLD-VIEW-UI-PLAN.md, "Tech"): one painted
 * background, objects fitted into fixed boxes (plates, or an empty-plot
 * placeholder), code-drawn overlays (scaffold, glow, day/night, weather),
 * hit boxes in an SVG with the same viewBox, and pins. Campus and world map
 * both use it.
 */
const props = withDefaults(
  defineProps<{
    width: number;
    height: number;
    objects: SceneObject[];
    scene?: string | null;
    ground?: string | null;
    /** Colour past the ground image. */
    surround?: string;
    selected?: string | null;
    debug?: boolean;
    /** 0 = midday, 1 = night. */
    night?: number;
    weather?: 'rain' | 'overcast' | null;
    fadeEdges?: boolean;
    /** How far past the picture you may pan, in scene sizes. */
    margin?: number;
    label?: string;
  }>(),
  {
    scene: null,
    ground: null,
    surround: '#79a800',
    selected: null,
    debug: false,
    night: 0,
    weather: null,
    fadeEdges: true,
    margin: 1,
    label: 'Scene',
  }
);
const emit = defineEmits<{ (e: 'select', id: string): void }>();

const viewport = ref<HTMLElement | null>(null);
const pz = usePanZoom(viewport, () => props.width, () => props.height, props.margin);
const handlers = pz.handlers;
const listOpen = ref(false);

const pct = (v: number, of: 'x' | 'y') => `${(v / (of === 'x' ? props.width : props.height)) * 100}%`;

const drawn = computed(() => props.objects.filter((o) => !o.bare).sort((a, b) => (a.z ?? 1) - (b.z ?? 1) || a.y - b.y));
const sortedList = computed(() => [...props.objects].sort((a, b) => a.label.localeCompare(b.label)));

const boxStyle = (o: SceneObject) => ({
  left: pct(o.x - o.w / 2, 'x'),
  top: pct(o.y - o.h, 'y'),
  width: pct(o.w, 'x'),
  height: pct(o.h, 'y'),
});
const glowStyle = (o: SceneObject) => ({
  left: pct(o.x - o.w * 0.6, 'x'),
  top: pct(o.y - o.h * 1.2, 'y'),
  width: pct(o.w * 1.2, 'x'),
  height: pct(o.h * 1.2, 'y'),
});
const pinStyle = (o: SceneObject) => ({
  left: pct(o.pin?.[0] ?? o.x, 'x'),
  top: pct(o.pin?.[1] ?? o.y - o.h, 'y'),
});
const hitBoxes = (o: SceneObject) => o.hit ?? [[o.x - o.w / 2, o.y - o.h, o.w, o.h] as [number, number, number, number]];

const groundStyle = computed(() => ({
  left: `${-props.margin * 100}%`,
  top: `${-props.margin * 100}%`,
  width: `${(1 + 2 * props.margin) * 100}%`,
  height: `${(1 + 2 * props.margin) * 100}%`,
}));
const sceneFilter = computed(() => {
  const n = Math.max(0, Math.min(1, props.night));
  const overcast = props.weather ? 0.12 : 0;
  if (!n && !overcast) return undefined;
  return `brightness(${1 - 0.5 * n - overcast}) saturate(${1 - 0.3 * n - overcast}) hue-rotate(${-15 * n}deg)`;
});
function hideImg(e: Event) {
  (e.target as HTMLElement).style.display = 'none';
}

defineExpose({ focus: pz.focus, resetView: pz.resetView });
</script>

<style scoped>
.ws-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}
.ws-viewport:active {
  cursor: grabbing;
}
.ws-map {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  transition: filter 1.5s ease;
}
.ws-map.is-animated {
  transition: transform 0.25s ease-out, filter 1.5s ease;
}
.ws-ground {
  position: absolute;
  pointer-events: none;
  user-select: none;
}
.ws-scene,
.ws-hits {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  user-select: none;
}
.ws-scene {
  object-fit: fill;
  pointer-events: none;
}
.ws-scene.is-faded {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 5%, #000 95%, transparent),
    linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(to right, transparent, #000 5%, #000 95%, transparent),
    linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent);
  mask-composite: intersect;
}
.ws-scene-blank {
  background:
    radial-gradient(ellipse at 30% 40%, rgba(255, 255, 255, 0.08), transparent 60%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 48px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 48px),
    linear-gradient(160deg, #1d4f6e, #173b54 60%, #10283a);
}
.ws-plate {
  position: absolute;
  object-fit: contain;
  object-position: bottom center;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.35));
}
.ws-plate.is-building {
  filter: grayscale(0.5) brightness(0.8) drop-shadow(0 3px 3px rgba(0, 0, 0, 0.35));
}
.ws-empty {
  position: absolute;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
}
.ws-empty::before {
  content: '';
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 0;
  height: 60%;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  background: rgba(120, 80, 40, 0.45);
  border: 2px dashed rgba(255, 255, 255, 0.6);
}
.ws-empty span {
  position: relative;
  margin-bottom: 22%;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
/* Upgrading: a striped scaffold over the plot. */
.ws-scaffold {
  position: absolute;
  pointer-events: none;
  background:
    repeating-linear-gradient(45deg, rgba(251, 191, 36, 0.55) 0 6px, transparent 6px 22px),
    repeating-linear-gradient(-45deg, rgba(120, 72, 20, 0.45) 0 3px, transparent 3px 22px);
  -webkit-mask-image: linear-gradient(to top, #000 55%, transparent);
  mask-image: linear-gradient(to top, #000 55%, transparent);
  animation: ws-build 1.6s ease-in-out infinite;
}
@keyframes ws-build {
  50% {
    opacity: 0.6;
  }
}
.ws-glow {
  position: absolute;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 60%, rgba(255, 240, 180, 0.45), transparent 65%);
  mix-blend-mode: screen;
}
.ws-hit {
  fill: rgba(255, 255, 255, 0);
  stroke: rgba(255, 255, 255, 0);
  stroke-width: 3;
  cursor: pointer;
  transition: fill 0.15s, stroke 0.15s;
}
.ws-hit:hover,
.ws-hit.is-selected {
  fill: rgba(255, 214, 10, 0.2);
  stroke: #ffd60a;
}
.ws-hit.is-building {
  stroke: rgba(255, 176, 0, 0.9);
}
.ws-hit.is-debug {
  fill: rgba(255, 0, 90, 0.18);
  stroke: #ff005a;
}
.ws-weather {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ws-weather.is-rain {
  background: repeating-linear-gradient(105deg, rgba(200, 220, 255, 0.18) 0 1px, transparent 1px 14px);
  background-size: 200% 200%;
  animation: ws-rain 0.6s linear infinite;
}
.ws-weather.is-overcast {
  background: rgba(90, 100, 120, 0.18);
}
@keyframes ws-rain {
  to {
    background-position: -40px 120px;
  }
}
.ws-pin {
  position: absolute;
  transform: translate(-50%, -100%) scale(var(--inv, 1));
  transform-origin: 50% 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}
.ws-pin:hover,
.ws-pin.is-selected {
  z-index: 3;
}
.ws-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 6px;
  border-radius: 999px;
  color: #fff;
  font-size: clamp(10px, 1vw, 13px);
  white-space: nowrap;
  background: rgba(12, 19, 34, 0.88);
  backdrop-filter: blur(10px);
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
}
.ws-pin:hover .ws-tag,
.ws-pin.is-selected .ws-tag {
  border-color: #ffd700;
}
.ws-tag-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.ws-tag-icon {
  font-size: 1.1em;
  line-height: 1;
}
.ws-tag-name {
  font-weight: 700;
}
.ws-tag-badge,
.ws-tag-status {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  font-size: 0.85em;
  font-weight: 600;
}
.ws-tag-status {
  background: rgba(20, 184, 166, 0.35);
}
.ws-progress {
  min-width: 132px;
  padding: 5px 8px 6px;
  border-radius: 12px;
  color: #fde68a;
  font-size: 11px;
  background: rgba(12, 19, 34, 0.92);
  border: 1.5px solid #fbbf24;
}
.ws-progress-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.ws-controls {
  position: absolute;
  right: 14px;
  bottom: 120px;
  z-index: 18;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ws-controls button {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  background: rgba(12, 19, 34, 0.88);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}
.ws-controls button:hover {
  border-color: #ffd700;
}
.ws-list {
  position: absolute;
  right: 60px;
  bottom: 120px;
  z-index: 19;
  width: 260px;
  max-height: 55vh;
  overflow-y: auto;
  border-radius: 14px;
  padding: 8px;
  background: rgba(12, 19, 34, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #fff;
}
.ws-list-title {
  font-size: 12px;
  font-weight: 700;
  opacity: 0.7;
  padding: 4px 6px 8px;
}
.ws-list-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
}
.ws-list-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
.ws-list-meta {
  opacity: 0.65;
  font-size: 11px;
  white-space: nowrap;
}
</style>
