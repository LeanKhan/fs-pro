<template>
  <div ref="wrap" class="wtm" :class="{ dragging }">
    <svg
      ref="svg"
      class="wtm-svg"
      :viewBox="`${store.view.x} ${store.view.y} ${store.view.w} ${store.viewH}`"
      preserveAspectRatio="none"
      role="img"
      aria-label="World map"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel.prevent="onWheel"
    >
      <defs>
        <radialGradient id="wtm-sea" cx="50%" cy="45%" r="75%">
          <stop offset="0" stop-color="#8fd3ef" />
          <stop offset="1" stop-color="#4b9fd3" />
        </radialGradient>
        <pattern id="wtm-waves" width="60" height="34" patternUnits="userSpaceOnUse">
          <path d="M4 12 q6 -6 12 0 t12 0" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2" stroke-linecap="round" />
          <path d="M34 28 q6 -6 12 0 t12 0" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2" stroke-linecap="round" />
        </pattern>
        <filter id="wtm-goo" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
        <filter id="wtm-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="0" flood-color="#2b5f80" flood-opacity=".45" />
        </filter>
      </defs>

      <rect :x="sea.x" :y="sea.y" :width="sea.w" :height="sea.h" fill="url(#wtm-sea)" />
      <rect :x="sea.x" :y="sea.y" :width="sea.w" :height="sea.h" fill="url(#wtm-waves)" />

      <!-- Land: soft blobs per visible place, tinted by their nation. -->
      <g class="island" :class="{ dim: dimCountryOf }">
        <g filter="url(#wtm-goo)" opacity=".34">
          <circle v-for="b in land" :key="`a-${b.id}`" :cx="b.x" :cy="b.y" :r="b.r + 24" :fill="b.color" />
        </g>
        <g filter="url(#wtm-goo)">
          <circle v-for="b in land" :key="`s-${b.id}`" :cx="b.x" :cy="b.y + 6" :r="b.r + 9" fill="#e9d6a1" />
        </g>
        <g filter="url(#wtm-goo)">
          <circle v-for="b in land" :key="`l-${b.id}`" :cx="b.x" :cy="b.y" :r="b.r" :fill="b.land" />
        </g>
      </g>

      <!-- Competitions (venues) -->
      <g
        v-for="v in venues"
        :key="`v-${v.id}`"
        class="venue hit"
        :transform="`translate(${v.x} ${v.y}) scale(${sym})`"
        @click.stop="pick('venue', v.id)"
      >
        <circle r="17" :fill="v.tint" stroke="#fff" stroke-width="3" filter="url(#wtm-shadow)" />
        <text y="6" text-anchor="middle" font-size="17">{{ v.icon }}</text>
        <text v-if="showNames" class="venue-label" y="32" text-anchor="middle">{{ v.label }}</text>
        <circle v-if="isSelected('venue', v.id)" r="23" class="sel-ring" />
      </g>

      <!-- Place markers: regions, cities and districts (countries get flags). -->
      <g
        v-for="p in settlements"
        :key="`p-${p.id}`"
        class="place hit"
        :class="{ dim: dimPlace(p) }"
        :transform="`translate(${p.x} ${p.y}) scale(${sym})`"
        @click.stop="pick(p.kind, p.id)"
      >
        <ellipse cx="0" cy="7" rx="13" ry="4" fill="#000" opacity=".15" />
        <path :d="HOUSE[p.kind]" fill="#fff6e0" stroke="#5e3b22" stroke-width="2" stroke-linejoin="round" />
        <path :d="ROOF_PATH[p.kind]" :fill="p.roof" stroke="#5e3b22" stroke-width="2" stroke-linejoin="round" />
        <circle v-if="isSelected(p.kind, p.id)" r="19" class="sel-ring" />
        <g v-if="p.clubs && !pins.length" transform="translate(12 -14)">
          <circle r="8" fill="#e5402f" stroke="#fff" stroke-width="2" />
          <text y="3.6" text-anchor="middle" class="count">{{ p.clubs }}</text>
        </g>
        <text v-if="showNames" class="place-name" y="24" text-anchor="middle">{{ p.name }}</text>
      </g>

      <!-- Clubs: crest pins, fanned where several share a district centre. -->
      <g
        v-for="pin in pins"
        :key="`c-${pin.club.id}`"
        class="club hit"
        :class="{ human: pin.club.human, mine: myClubIds.has(pin.club.id), marked: highlightClubIds.has(pin.club.id) }"
        :transform="`translate(${pin.x} ${pin.y}) scale(${sym})`"
        @click.stop="pick('club', pin.club.id)"
      >
        <title>{{ pin.club.name }}</title>
        <circle r="11" class="pin-bg" />
        <image :href="crestUrl(pin.club.code)" x="-9" y="-9.5" width="18" height="19" />
        <circle v-if="isSelected('club', pin.club.id)" r="14" class="sel-ring" />
      </g>

      <!-- Regions: their names, once zoomed in a little -->
      <g v-if="showNames && store.level === 'region'" class="regions" pointer-events="none">
        <text
          v-for="r in store.places"
          :key="`r-${r.id}`"
          class="region-name"
          :transform="`translate(${r.x} ${r.y - 26}) scale(${labelScale})`"
          text-anchor="middle"
        >
          {{ r.name }}
        </text>
      </g>

      <!-- Country flags and names, always on (from the chrome, not the tiles). -->
      <g
        v-for="c in store.countries"
        :key="`f-${c.id}`"
        class="country hit"
        :class="{ dim: dimCountry(c.id) }"
        @click.stop="pick('country', c.id)"
      >
        <g :transform="`translate(${c.x} ${c.y - 46 * sym}) scale(${labelScale})`">
          <g transform="translate(0 -6)">
            <rect x="-14" y="-30" width="28" height="9" :fill="c.colors[0]" stroke="#3b2a1a" stroke-width="1.5" rx="1.5" />
            <rect x="-14" y="-21" width="28" height="9" :fill="c.colors[1]" stroke="#3b2a1a" stroke-width="1.5" rx="1.5" />
          </g>
          <text v-if="showNames" class="country-name" text-anchor="middle">{{ c.name }}</text>
        </g>
      </g>

      <g v-if="pending" :transform="`translate(${pending.x} ${pending.y}) scale(${sym})`" pointer-events="none">
        <g class="pending">
          <path d="M0 0 V-30" stroke="#5e3b22" stroke-width="3" />
          <path d="M0 -30 h22 v14 h-22 z" fill="#f5b82e" stroke="#3b2a1a" stroke-width="1.5" />
          <circle r="5" fill="#5e3b22" />
        </g>
      </g>
    </svg>

    <div class="wtm-zoom">
      <button class="roundbtn" aria-label="Zoom in" @click="zoomBy(1.4)">+</button>
      <button class="roundbtn" aria-label="Zoom out" @click="zoomBy(1 / 1.4)">−</button>
      <button class="roundbtn" aria-label="Whole world" v-html="icon('map')" @click="fitAll()"></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { TileClub, TilePlace } from '@repo/api-contract';
import { crestUrl } from '@/helpers/crest';
import { icon } from '@/components/cozy/icons';
import { useWorldTilesStore } from '@/store/world-tiles';

export interface AtlasVenue {
  id: string;
  x: number;
  y: number;
  label: string;
  icon: string;
  tint: string;
  status?: string;
}
export type AtlasPick = { kind: 'country' | 'region' | 'city' | 'district' | 'club' | 'venue'; id: string };

const props = withDefaults(
  defineProps<{
    selected?: AtlasPick | null;
    venues?: AtlasVenue[];
    myClubIds?: Set<string>;
    highlightClubIds?: Set<string>;
    /** A chosen spot waiting for its form. */
    pending?: { x: number; y: number } | null;
    /** Fade every other country. */
    focusCountryId?: string | null;
    /** Screen pixels covered by panels on each side. */
    insets?: { top?: number; right?: number; bottom?: number; left?: number };
  }>(),
  {
    selected: null,
    venues: () => [],
    myClubIds: () => new Set<string>(),
    highlightClubIds: () => new Set<string>(),
    pending: null,
    focusCountryId: null,
    insets: () => ({}),
  }
);
const emit = defineEmits<{ (e: 'select', pick: AtlasPick | null): void }>();

const store = useWorldTilesStore();
const wrap = ref<HTMLDivElement | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const dragging = ref(false);

const HOUSE: Record<string, string> = {
  region: 'M-8 6 V-3 H8 V6 Z',
  city: 'M-10 6 V-4 H-3 V-9 H10 V6 Z',
  district: 'M-8 6 V-2 H8 V6 Z',
};
const ROOF_PATH: Record<string, string> = {
  region: 'M-11 -3 L0 -12 L11 -3 Z',
  city: 'M-11 -4 L-6.5 -9 L-2 -4 Z M-4 -9 L3.5 -15 L11 -9 Z',
  district: 'M-10 -1 L0 -14 L10 -1 Z',
};
const ROOF_COLOURS = ['#e5402f', '#3a8ee0', '#2f8a1c', '#3f6b3a', '#7a4a2a'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * t + ((pb >> s) & 255) * (1 - t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
const GREENS = ['#9bd46e', '#8fcf63', '#a6d977', '#93cc6a'];

// --- Data derived from the store -------------------------------------------

const zoom = computed(() => 1600 / store.view.w);
const sym = computed(() => zoom.value ** -0.72);
const labelScale = computed(() => zoom.value ** -0.78);
const showNames = computed(() => zoom.value >= 1.1);

const sea = computed(() => ({
  x: store.view.x - store.view.w,
  y: store.view.y - store.viewH,
  w: store.view.w * 3,
  h: store.viewH * 3,
}));

/** Land is drawn per visible place; at the club level (z5) there are no place
 * markers, so the clubs themselves become small land patches. */
const landPoints = computed<{ id: string; x: number; y: number; clubs: number; type: string }[]>(() =>
  store.level === 'club'
    ? store.clubs.map((c) => ({ id: c.id, x: c.x, y: c.y, clubs: 1, type: 'club' }))
    : store.places.map((p) => ({ id: p.id, x: p.x, y: p.y, clubs: p.clubs, type: p.type }))
);

const land = computed(() =>
  landPoints.value.map((p) => {
    const nation = store.nationNear(p.x, p.y);
    const color = nation?.colors?.[0] ?? GREENS[hash(p.id) % GREENS.length]!;
    const r = p.type === 'country' ? 34 + Math.min(p.clubs, 24) * 2.6 : p.type === 'region' ? 26 : p.type === 'city' ? 19 : p.type === 'club' ? 16 : 13;
    return { id: p.id, x: p.x, y: p.y, r, color, land: mix(color, GREENS[hash(p.id) % GREENS.length]!, 0.16) };
  })
);

/** Regions, cities and districts become houses; countries get flags instead. */
const settlements = computed(() =>
  store.places
    .filter((p: TilePlace) => p.type !== 'country')
    .map((p: TilePlace) => ({
      ...p,
      kind: (p.type === 'region' ? 'region' : p.type === 'city' ? 'city' : 'district') as 'region' | 'city' | 'district',
      roof: ROOF_COLOURS[hash(p.id) % ROOF_COLOURS.length]!,
    }))
);

const pins = computed(() => {
  const groups = new Map<string, TileClub[]>();
  for (const c of store.clubs) {
    const k = `${Math.round(c.x / 12)}:${Math.round(c.y / 12)}`;
    const arr = groups.get(k);
    if (arr) arr.push(c);
    else groups.set(k, [c]);
  }
  const out: { club: TileClub; x: number; y: number }[] = [];
  for (const arr of groups.values()) {
    const n = arr.length;
    const span = Math.min(Math.PI, (n - 1) * 0.7);
    const ring = 9 * sym.value;
    arr.forEach((club, i) => {
      const a = -Math.PI / 2 + (n > 1 ? -span / 2 + (i * span) / (n - 1) : 0);
      out.push({ club, x: club.x + Math.cos(a) * ring, y: club.y + Math.sin(a) * ring });
    });
  }
  return out;
});

const dimCountry = (id: string) => !!props.focusCountryId && props.focusCountryId !== id;
const dimCountryOf = computed(() => !!props.focusCountryId);
const dimPlace = (p: { x: number; y: number }) => {
  const focus = props.focusCountryId;
  if (!focus) return false;
  return store.nationNear(p.x, p.y)?.id !== focus;
};
const isSelected = (kind: string, id: string) => props.selected?.kind === kind && props.selected.id === id;

// --- Interaction ------------------------------------------------------------

function toWorld(clientX: number, clientY: number) {
  const el = svg.value;
  const m = el?.getScreenCTM();
  if (!el || !m) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

function pick(kind: AtlasPick['kind'], id: string) {
  if (moved) return;
  emit('select', { kind, id });
}

const pointers = new Map<number, { x: number; y: number }>();
let moved = false;
let start: { x: number; y: number; vx: number; vy: number } | null = null;
let pinch: { d: number; w: number } | null = null;

function onDown(e: PointerEvent) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), w: store.view.w };
  } else {
    start = { x: e.clientX, y: e.clientY, vx: store.view.x, vy: store.view.y };
  }
}

function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    const mid = toWorld((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
    setWidthAround(pinch.w * (pinch.d / Math.max(d, 1)), mid);
    moved = true;
    return;
  }
  if (!start) return;
  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  if (!moved && Math.hypot(dx, dy) < 6) return;
  if (!moved) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  moved = true;
  dragging.value = true;
  const k = store.view.w / (svg.value?.getBoundingClientRect().width || 1);
  store.setView({ x: start.vx - dx * k, y: start.vy - dy * k });
}

function onUp(e: PointerEvent) {
  const wasClick = !moved && pointers.size === 1 && pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    start = null;
    dragging.value = false;
  }
  if (!wasClick) {
    setTimeout(() => (moved = false), 0);
    return;
  }
  const target = e.target as Element;
  if (!target.closest('.hit')) emit('select', null);
}

function setWidthAround(w: number, around: { x: number; y: number }) {
  const nw = Math.max(24, w);
  const k = nw / store.view.w;
  store.setView({ w: nw, x: around.x - (around.x - store.view.x) * k, y: around.y - (around.y - store.view.y) * k });
}

function onWheel(e: WheelEvent) {
  setWidthAround(store.view.w * Math.exp(e.deltaY * 0.0015), toWorld(e.clientX, e.clientY));
}

function zoomBy(f: number) {
  const c = { x: store.view.x + store.view.w / 2, y: store.view.y + store.viewH / 2 };
  setWidthAround(store.view.w / f, c);
}

let anim = 0;
/** Glide the view so `box` (atlas units) fills the screen space left between
 * the insets. */
function flyTo(box: { x: number; y: number; w: number; h: number }) {
  const r = svg.value?.getBoundingClientRect();
  const sw = r?.width || 1;
  const sh = r?.height || 1;
  const { top = 0, right = 0, bottom = 0, left = 0 } = props.insets;
  const uw = Math.max(sw - left - right, sw * 0.3);
  const uh = Math.max(sh - top - bottom, sh * 0.3);
  const k = Math.min(4200 / sw, Math.max(24 / sw, box.w / uw, box.h / uh));
  const target = {
    x: box.x + box.w / 2 - (left + uw / 2) * k,
    y: box.y + box.h / 2 - (top + uh / 2) * k,
    w: sw * k,
  };
  const from = { x: store.view.x, y: store.view.y, w: store.view.w };
  const t0 = performance.now();
  cancelAnimationFrame(anim);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 450);
    const e = 1 - (1 - t) ** 3;
    store.setView({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e });
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

function fitAll() {
  const size = store.worldSize;
  flyTo({ x: 20, y: 20, w: size.width - 40, h: size.height - 40 });
}

function focusCountry(id: string) {
  const c = store.countries.find((x) => x.id === id);
  if (!c) return;
  flyTo({ x: c.x - 300, y: c.y - 300, w: 600, h: 600 });
}

function focusPoint(x: number, y: number, span = 360) {
  flyTo({ x: x - span / 2, y: y - span / 2, w: span, h: span });
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('select', null);
}

let resize: ResizeObserver | null = null;
onMounted(() => {
  window.addEventListener('keydown', onKey);
  const r = svg.value?.getBoundingClientRect();
  if (r?.width) store.setAspect(r.height / r.width);
  resize = new ResizeObserver(() => {
    const box = svg.value?.getBoundingClientRect();
    if (box?.width) store.setAspect(box.height / box.width);
  });
  if (svg.value) resize.observe(svg.value);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  resize?.disconnect();
  cancelAnimationFrame(anim);
});

defineExpose({ flyTo, fitAll, focusCountry, focusPoint, zoomBy });
</script>

<style scoped>
.wtm {
  position: absolute;
  inset: 0;
  background: #5aaedb;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}
.wtm.dragging {
  cursor: grabbing;
}
.wtm-svg {
  width: 100%;
  height: 100%;
  display: block;
  font-family: 'Fredoka', system-ui, sans-serif;
}
.island,
.country,
.place {
  transition: opacity 0.25s;
}
.dim {
  opacity: 0.45;
}
.hit {
  cursor: pointer;
}
.region-name {
  font-size: 13px;
  font-weight: 700;
  font-style: italic;
  fill: #3f5f2a;
  fill-opacity: 0.75;
  stroke: #e8f3cf;
  stroke-width: 3px;
  paint-order: stroke;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
.country-name {
  font-size: 22px;
  font-weight: 700;
  fill: #fffaf0;
  stroke: #3b2a1a;
  stroke-width: 5px;
  paint-order: stroke;
  letter-spacing: 0.5px;
}
.place-name {
  font-size: 10.5px;
  font-weight: 600;
  fill: #3b2a1a;
  stroke: #fffaf0;
  stroke-width: 3px;
  paint-order: stroke;
}
.place:hover .place-name {
  font-size: 12px;
}
.count {
  font-size: 10px;
  font-weight: 700;
  fill: #fff;
}
.pin-bg {
  fill: #fffaf0;
  stroke: #5e3b22;
  stroke-width: 1.6;
}
.club.human .pin-bg {
  stroke: #f5b82e;
  stroke-width: 2.6;
}
.club.mine .pin-bg {
  fill: #fff1c4;
  stroke: #f08a1c;
  stroke-width: 3;
}
.club.marked .pin-bg {
  stroke: #e5402f;
  stroke-width: 3;
}
.sel-ring {
  fill: none;
  stroke: #f5b82e;
  stroke-width: 3.5;
  stroke-dasharray: 6 4;
  animation: wtm-spin 6s linear infinite;
}
@keyframes wtm-spin {
  to {
    stroke-dashoffset: -60;
  }
}
.venue-label {
  font-size: 11px;
  font-weight: 700;
  fill: #fffaf0;
  stroke: #3b2a1a;
  stroke-width: 3.5px;
  paint-order: stroke;
}
.pending {
  animation: wtm-bob 1.2s ease-in-out infinite;
}
@keyframes wtm-bob {
  50% {
    transform: translateY(-4px);
  }
}
.wtm-zoom {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2;
}
.wtm-zoom .roundbtn {
  width: 42px;
  height: 42px;
  font-size: 24px;
  font-weight: 700;
  color: #5e3b22;
}
.wtm-zoom .roundbtn :deep(.ic) {
  width: 24px;
  height: 24px;
}
@media (max-width: 760px) {
  .wtm-zoom {
    left: auto;
    right: 8px;
    top: 84px;
    transform: none;
    flex-direction: row;
  }
  .wtm-zoom .roundbtn {
    width: 36px;
    height: 36px;
    font-size: 20px;
  }
}
</style>
