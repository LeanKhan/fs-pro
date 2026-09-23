<template>
  <div
    ref="viewport"
    class="cm-viewport"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @click.capture="onClickCapture"
  >
    <div class="cm-map" :class="{ 'is-animated': animate }" :style="mapStyle">
      <!-- Grass all round, so you can zoom out past the picture's edge. -->
      <img class="cm-ground" :src="GROUND_IMAGE" alt="" draggable="false" />
      <img class="cm-image" :src="MAP_IMAGE" alt="Club campus" draggable="false" />

      <!-- Buildings and scenery, sorted so nearer things draw over farther ones. -->
      <img
        v-for="(s, i) in sprites"
        :key="i"
        :src="s.src"
        class="cm-sprite"
        :class="{ 'is-building': s.building, 'is-flipped': s.flip }"
        :style="{
          left: pct(s.left, MAP_WIDTH),
          top: pct(s.top, MAP_HEIGHT),
          width: pct(s.w, MAP_WIDTH),
        }"
        alt=""
        draggable="false"
      />

      <!-- Walking Supporters (scales with fan count) -->
      <campus-fans :fans-count="fansCount" />

      <!-- Club signage: the viewed club's own crest, layered onto each sign's panel -->
      <img
        v-for="(s, i) in signCrests"
        :key="`crest-${i}`"
        :src="s.src"
        class="cm-crest"
        :style="{ left: pct(s.left, MAP_WIDTH), top: pct(s.top, MAP_HEIGHT), width: pct(s.w, MAP_WIDTH) }"
        alt=""
        draggable="false"
      />

      <!-- Interactable areas: same viewBox as the image, so they never drift. -->
      <svg class="cm-hotspots" :viewBox="`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`" preserveAspectRatio="none">
        <rect
          v-for="h in areas"
          :key="h.id"
          v-bind="h.box"
          rx="10"
          class="cm-hotspot"
          :class="{ 'is-upgrading': !!h.upgrade, 'is-selected': selected === h.key, 'is-debug': debug }"
          @click="emit('select', h.key)"
        />
      </svg>

      <!-- Name / level / build-timer pins, positioned in % of the same box. -->
      <button
        v-for="h in views"
        :key="h.key"
        type="button"
        class="cm-pin"
        :class="{ 'is-upgrading': !!h.upgrade }"
        :style="{ left: h.left, top: h.top }"
        @click="emit('select', h.key)"
      >
        <span v-if="h.upgrade" class="cm-build">
          <span class="cm-build-row">
            <span>🔨 Building</span>
            <b>{{ h.upgrade.clock }}</b>
          </span>
          <v-progress-linear
            :model-value="h.upgrade.pct"
            color="amber"
            height="6"
            rounded
            bg-color="rgba(0,0,0,.55)"
          ></v-progress-linear>
        </span>
        <span class="cm-tag">
          <span class="cm-tag-icon">{{ h.icon }}</span>
          <span class="cm-tag-name">{{ h.title }}</span>
          <span v-if="!h.nonFacility" class="cm-tag-level">Lv {{ h.level }}</span>
        </span>
      </button>
    </div>

    <div class="cm-zoom" @pointerdown.stop @click.stop>
      <button type="button" title="Zoom in" @click="zoomBy(1.4)">+</button>
      <button type="button" title="Zoom out" @click="zoomBy(1 / 1.4)">&minus;</button>
      <button type="button" title="Reset view" @click="resetView()">&#x2922;</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { AssetState } from '@repo/api-contract';
import CampusFans from './campus-fans.vue';
import {
  DECOR,
  GROUND_IMAGE,
  HOTSPOTS,
  MAP_HEIGHT,
  MAP_IMAGE,
  MAP_WIDTH,
  placeSprite,
  SIGN_PANELS,
  SIGNS,
  spritesFor,
} from './map-config';

const props = defineProps<{
  assets: AssetState[];
  selected?: string | null;
  nowMs: number;
  /** Outline every hotspot (for fitting polygons to the image). */
  debug?: boolean;
  fansCount?: number;
  /** The viewed club's code, for the crest on its campus signage. */
  clubCode?: string | null;
}>();

const emit = defineEmits<{ (e: 'select', key: string): void }>();

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function clock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PAD = 8;

const views = computed(() =>
  HOTSPOTS.map((h) => {
    const asset = props.assets.find((a) => a.type === h.key);
    const level = asset?.level ?? 0;
    let upgrade: { pct: number; clock: string } | null = null;
    if (asset?.upgrade) {
      const start = new Date(asset.upgrade.startAt).getTime();
      const end = new Date(asset.upgrade.completeAt).getTime();
      upgrade = {
        pct: Math.min(100, Math.max(0, ((props.nowMs - start) / Math.max(end - start, 1)) * 100)),
        clock: clock(Math.max(Math.ceil((end - props.nowMs) / 1000), 0)),
      };
    }
    // Clickable area = box around the facility's sprites; the pin sits on its top edge.
    const placed = spritesFor(h, level);
    const x0 = Math.min(...placed.map((s) => s.left)) - PAD;
    const x1 = Math.max(...placed.map((s) => s.left + s.w)) + PAD;
    const y0 = Math.min(...placed.map((s) => s.top)) - PAD;
    const y1 = Math.max(...placed.map((s) => s.top + s.h)) + PAD;
    return {
      key: h.key,
      title: h.title,
      icon: h.icon,
      level,
      nonFacility: h.nonFacility,
      upgrade,
      placed,
      box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
      left: `${((h.pin?.[0] ?? (x0 + x1) / 2) / MAP_WIDTH) * 100}%`,
      top: `${((h.pin?.[1] ?? y0) / MAP_HEIGHT) * 100}%`,
    };
  })
);

/** One clickable box per sprite (so a facility's parts don't cover its neighbours). */
const areas = computed(() =>
  views.value.flatMap((v) =>
    v.placed.map((p, i) => ({
      id: `${v.key}-${i}`,
      key: v.key,
      upgrade: v.upgrade,
      box: { x: p.left - PAD / 2, y: p.top - PAD / 2, width: p.w + PAD, height: p.h + PAD },
    }))
  )
);

const sprites = computed(() => {
  const all = [
    ...DECOR.map((d) => ({ ...placeSprite(d), building: false })),
    ...SIGNS.map((s) => ({ ...placeSprite(s), building: false })),
    ...views.value.flatMap((v) => v.placed.map((p) => ({ ...p, building: !!v.upgrade }))),
  ];
  return all.sort((a, b) => (a.z ?? 1) - (b.z ?? 1) || a.y - b.y);
});

/** The club crest, sized and positioned onto each sign's blank panel. */
const signCrests = computed(() => {
  if (!props.clubCode) return [];
  const src = `/club-icons/${props.clubCode}.svg`;
  return SIGNS.map((s) => {
    const board = placeSprite(s);
    const panel = SIGN_PANELS[s.img];
    return {
      src,
      left: board.left + panel.left * board.w,
      top: board.top + panel.top * board.h,
      w: panel.width * board.w,
    };
  });
});

// ---- Zoom & pan -----------------------------------------------------------
// The map box is sized to COVER the screen at zoom 1 (baseW/baseH) and moved with
// translate + scale. The grass surround (ground image, 3x the map) lets you zoom
// out past the picture; panning is clamped so you never see beyond it.
const RATIO = MAP_WIDTH / MAP_HEIGHT;
const MAX_ZOOM = 3;
const viewport = ref<HTMLElement | null>(null);
const view = reactive({ vw: 0, vh: 0, s: 1, tx: 0, ty: 0 });
const animate = ref(false);
let touched = false;

const baseW = computed(() => Math.max(view.vw, view.vh * RATIO));
const baseH = computed(() => baseW.value / RATIO);
const minZoom = computed(() => {
  if (!view.vw) return 1;
  // The ground is 3 map-sizes wide/tall: stay inside it, and never shrink past 0.5.
  return Math.max(0.5, view.vw / (3 * baseW.value), view.vh / (3 * baseH.value));
});

const mapStyle = computed(() => ({
  width: `${baseW.value}px`,
  height: `${baseH.value}px`,
  transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
  '--inv': String(1 / view.s),
}));

function clampView(s: number, tx: number, ty: number) {
  const z = Math.min(MAX_ZOOM, Math.max(minZoom.value, s));
  const w = baseW.value * z;
  const h = baseH.value * z;
  // The ground spans [tx - w, tx + 2w] horizontally (likewise vertically).
  return {
    s: z,
    tx: Math.min(w, Math.max(view.vw - 2 * w, tx)),
    ty: Math.min(h, Math.max(view.vh - 2 * h, ty)),
  };
}
function apply(next: { s: number; tx: number; ty: number }) {
  view.s = next.s;
  view.tx = next.tx;
  view.ty = next.ty;
}
function resetView() {
  animateOnce();
  touched = false;
  apply(clampView(1, (view.vw - baseW.value) / 2, (view.vh - baseH.value) / 2));
}
function zoomAt(factor: number, cx: number, cy: number) {
  touched = true;
  const z = Math.min(MAX_ZOOM, Math.max(minZoom.value, view.s * factor));
  const k = z / view.s;
  apply(clampView(z, cx - (cx - view.tx) * k, cy - (cy - view.ty) * k));
}
function zoomBy(factor: number) {
  animateOnce();
  zoomAt(factor, view.vw / 2, view.vh / 2);
}
let animTimer: ReturnType<typeof setTimeout> | undefined;
function animateOnce() {
  animate.value = true;
  clearTimeout(animTimer);
  animTimer = setTimeout(() => (animate.value = false), 260);
}

function onWheel(e: WheelEvent) {
  const r = viewport.value!.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
}

// One finger/mouse drags, two fingers pinch. Pointer capture only starts once a
// drag is real, so plain taps still reach the buildings.
const pointers = new Map<number, { x: number; y: number }>();
let dragging = false;
let moved = 0;
let suppressClick = false;
let lastPinch = 0;

const pinchDist = () => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
const pinchMid = () => {
  const [a, b] = [...pointers.values()];
  const r = viewport.value!.getBoundingClientRect();
  return { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
};

function onPointerDown(e: PointerEvent) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) moved = 0;
  if (pointers.size === 2) lastPinch = pinchDist();
}
function onPointerMove(e: PointerEvent) {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2) {
    const d = pinchDist();
    if (lastPinch) {
      const m = pinchMid();
      zoomAt(d / lastPinch, m.x, m.y);
    }
    lastPinch = d;
    dragging = true;
    return;
  }
  moved += Math.abs(dx) + Math.abs(dy);
  if (!dragging && moved > 6) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  if (dragging) {
    touched = true;
    apply(clampView(view.s, view.tx + dx, view.ty + dy));
  }
}
function onPointerEnd(e: PointerEvent) {
  pointers.delete(e.pointerId);
  lastPinch = 0;
  if (pointers.size === 0 && dragging) {
    dragging = false;
    // A drag ends with a click event; swallow it so it doesn't open a building.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
  }
}
function onClickCapture(e: MouseEvent) {
  if (suppressClick) {
    e.stopPropagation();
    e.preventDefault();
  }
}

let observer: ResizeObserver | undefined;
function measure() {
  const el = viewport.value;
  if (!el) return;
  view.vw = el.clientWidth;
  view.vh = el.clientHeight;
  if (touched) apply(clampView(view.s, view.tx, view.ty));
  else apply(clampView(1, (view.vw - baseW.value) / 2, (view.vh - baseH.value) / 2));
}
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(viewport.value!);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimeout(animTimer);
});
</script>

<style scoped>
/* The viewport is the screen; the map always COVERS it (like object-fit:
   cover) and is centred, so hotspots and pins - sized in % of the map box -
   stay glued to the picture. */
.cm-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #79a800;
  touch-action: none;
  cursor: grab;
}
.cm-viewport:active {
  cursor: grabbing;
}
.cm-map {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
.cm-map.is-animated {
  transition: transform 0.25s ease-out;
}
.cm-ground {
  position: absolute;
  left: -100%;
  top: -100%;
  width: 300%;
  height: 300%;
  pointer-events: none;
  user-select: none;
}
.cm-image,
.cm-hotspots {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  user-select: none;
}
.cm-image {
  object-fit: fill;
  pointer-events: none;
  /* Fade the picture's edges into the grass surround. */
  -webkit-mask-image: linear-gradient(to right, transparent, #000 5%, #000 95%, transparent),
    linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(to right, transparent, #000 5%, #000 95%, transparent),
    linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent);
  mask-composite: intersect;
}
.cm-zoom {
  position: absolute;
  right: 14px;
  bottom: 120px;
  z-index: 18;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cm-zoom button {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  background: rgba(12, 19, 34, 0.88);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cm-zoom button:hover {
  background: rgba(15, 23, 42, 0.95);
  border-color: #ffd700;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(255, 215, 0, 0.35);
  transform: translateY(-1px);
}
.cm-zoom button:active {
  transform: translateY(1px);
}

.cm-sprite {
  position: absolute;
  height: auto;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.35));
}
.cm-sprite.is-flipped {
  transform: scaleX(-1);
}
.cm-crest {
  position: absolute;
  height: auto;
  pointer-events: none;
  user-select: none;
}
/* Under construction: dimmed and pulsing until the timer finishes. */
.cm-sprite.is-building {
  filter: grayscale(0.5) brightness(0.8) drop-shadow(0 3px 3px rgba(0, 0, 0, 0.35));
  animation: cm-build 1.6s ease-in-out infinite;
}
@keyframes cm-build {
  50% {
    opacity: 0.65;
  }
}

.cm-hotspot {
  fill: rgba(255, 255, 255, 0);
  stroke: rgba(255, 255, 255, 0);
  stroke-width: 3;
  stroke-linejoin: round;
  cursor: pointer;
  transition: fill 0.15s, stroke 0.15s, filter 0.15s;
}
.cm-hotspot:hover,
.cm-hotspot.is-selected {
  fill: rgba(255, 214, 10, 0.2);
  stroke: #ffd60a;
  filter: drop-shadow(0 0 8px rgba(255, 214, 10, 0.9));
}
.cm-hotspot.is-upgrading {
  stroke: rgba(255, 176, 0, 0.9);
  fill: rgba(255, 176, 0, 0.12);
  animation: cm-pulse 1.6s ease-in-out infinite;
}
.cm-hotspot.is-debug {
  fill: rgba(255, 0, 90, 0.18);
  stroke: #ff005a;
}
@keyframes cm-pulse {
  50% {
    fill: rgba(255, 176, 0, 0.28);
  }
}

.cm-pin {
  position: absolute;
  transform: translate(-50%, -50%) scale(var(--inv, 1));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cm-pin:hover {
  transform: translate(-50%, -55%) scale(calc(var(--inv, 1) * 1.08));
  z-index: 3;
}
.cm-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border-radius: 999px;
  color: #fff;
  font-size: clamp(10px, 1vw, 13px);
  letter-spacing: 0.02em;
  white-space: nowrap;
  background: rgba(12, 19, 34, 0.88);
  backdrop-filter: blur(10px);
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 10px rgba(99, 102, 241, 0.25);
  transition: all 0.2s ease;
}
.cm-pin:hover .cm-tag {
  border-color: #ffd700;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8), 0 0 16px rgba(255, 215, 0, 0.5);
  background: rgba(15, 23, 42, 0.95);
}
.cm-tag-icon {
  font-size: 1.1em;
  line-height: 1;
}
.cm-tag-name {
  font-weight: 700;
  color: #ffffff;
}
.cm-tag-level {
  padding: 1px 7px;
  border-radius: 999px;
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 0.85em;
  font-weight: 600;
}
.cm-build {
  min-width: 132px;
  padding: 5px 8px 6px;
  border-radius: 12px;
  color: #fde68a;
  font-size: 11px;
  background: rgba(12, 19, 34, 0.92);
  backdrop-filter: blur(10px);
  border: 1.5px solid #fbbf24;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6), 0 0 14px rgba(245, 158, 11, 0.3);
}
.cm-build-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.cm-build-row b {
  color: #fff;
  font-weight: 600;
}
</style>
