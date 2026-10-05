<template>
  <div ref="wrap" class="atlas" :class="{ placing: !!placing, dragging }">
    <svg
      ref="svg"
      class="atlas-svg"
      :viewBox="`${vb.x} ${vb.y} ${vb.w} ${vb.h}`"
      preserveAspectRatio="none"
      role="img"
      aria-label="World atlas"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="ghost = null"
      @wheel.prevent="onWheel"
    >
      <defs>
        <radialGradient id="atlas-sea" cx="50%" cy="45%" r="75%">
          <stop offset="0" stop-color="#8fd3ef" />
          <stop offset="1" stop-color="#4b9fd3" />
        </radialGradient>
        <pattern id="atlas-waves" width="60" height="34" patternUnits="userSpaceOnUse">
          <path d="M4 12 q6 -6 12 0 t12 0" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2" stroke-linecap="round" />
          <path d="M34 28 q6 -6 12 0 t12 0" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2" stroke-linecap="round" />
        </pattern>
        <filter id="atlas-goo" filterUnits="userSpaceOnUse" x="-200" y="-200" :width="atlas.width + 400" :height="atlas.height + 400">
          <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
        <filter id="atlas-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="0" flood-color="#2b5f80" flood-opacity=".45" />
        </filter>
      </defs>

      <rect :x="-atlas.width" :y="-atlas.height" :width="atlas.width * 3" :height="atlas.height * 3" fill="url(#atlas-sea)" />
      <rect :x="-atlas.width" :y="-atlas.height" :width="atlas.width * 3" :height="atlas.height * 3" fill="url(#atlas-waves)" />

      <!-- Land: one blob per country, grown around its towns, with a band of
           its colours in the water around it -->
      <g v-for="c in islands" :key="`land-${c.id}`" class="island" :class="{ dim: dimCountry(c.id) }">
        <g filter="url(#atlas-goo)" opacity=".38">
          <circle v-for="(b, i) in c.blobs" :key="`w${i}`" :cx="b.x" :cy="b.y" :r="b.r + 26" :fill="c.colors[0]" />
        </g>
        <g filter="url(#atlas-goo)">
          <circle v-for="(b, i) in c.blobs" :key="`s${i}`" :cx="b.x" :cy="b.y + 6" :r="b.r + 10" fill="#e9d6a1" />
        </g>
        <g filter="url(#atlas-goo)">
          <circle v-for="(b, i) in c.blobs" :key="`l${i}`" :cx="b.x" :cy="b.y" :r="b.r" :fill="c.land" />
        </g>
        <g class="trees" aria-hidden="true">
          <g v-for="(t, i) in c.trees" :key="`t${i}`" :transform="`translate(${t.x} ${t.y}) scale(${t.s})`">
            <ellipse cx="0" cy="6" rx="6" ry="2.4" fill="#000" opacity=".12" />
            <circle r="6" :fill="t.dark ? '#4f9a3a' : '#6cb84a'" />
            <circle cx="-2" cy="-2" r="2.4" fill="#fff" opacity=".18" />
          </g>
        </g>
      </g>

      <!-- Venues (competitions) -->
      <g v-for="v in venues" :key="`v-${v.id}`" class="venue hit" :transform="`translate(${v.x} ${v.y}) scale(${sym})`" @click.stop="pick('venue', v.id)">
        <circle r="17" :fill="v.tint" stroke="#fff" stroke-width="3" filter="url(#atlas-shadow)" />
        <text y="6" text-anchor="middle" font-size="17">{{ v.icon }}</text>
        <text v-if="showLabels" class="venue-label" y="32" text-anchor="middle">{{ v.label }}</text>
        <text v-if="showLabels && v.status" class="venue-status" y="45" text-anchor="middle">{{ v.status }}</text>
        <circle v-if="isSelected('venue', v.id)" r="23" class="sel-ring" />
      </g>

      <!-- Towns and their clubs -->
      <g v-for="t in townViews" :key="`town-${t.id}`" class="town hit" :class="{ dim: dimCountry(t.countryId), full: t.full }" @click.stop="pick('town', t.id)">
        <g :transform="`translate(${t.x} ${t.y}) scale(${sym})`">
          <ellipse cx="0" cy="7" rx="13" ry="4" fill="#000" opacity=".15" />
          <path :d="TERRAIN_HOUSE[t.terrain]" fill="#fff6e0" stroke="#5e3b22" stroke-width="2" stroke-linejoin="round" />
          <path :d="TERRAIN_ROOF[t.terrain]" :fill="t.roof" stroke="#5e3b22" stroke-width="2" stroke-linejoin="round" />
          <circle v-if="isSelected('town', t.id)" r="20" class="sel-ring" />
          <g v-if="t.clubCount && (!showCrests || !t.clubs.length) && zoom >= 1.3" transform="translate(12 -14)">
            <circle r="8" fill="#e5402f" stroke="#fff" stroke-width="2" />
            <text y="3.6" text-anchor="middle" class="count">{{ t.clubCount }}</text>
          </g>
          <text v-if="showTownNames" class="town-name" y="24" text-anchor="middle">{{ t.name }}</text>
          <template v-if="showCrests">
            <g
              v-for="p in t.pins"
              :key="p.club.id"
              class="club hit"
              :class="{ human: p.club.human, mine: myClubIds.has(p.club.id), marked: highlightClubIds.has(p.club.id) }"
              :transform="`translate(${p.x} ${p.y})`"
              @click.stop="pick('club', p.club.id)"
            >
              <title>{{ p.club.name }}</title>
              <circle r="11" class="pin-bg" />
              <image :href="crestUrl(p.club.code)" x="-9" y="-9.5" width="18" height="19" />
              <circle v-if="isSelected('club', p.club.id)" r="14" class="sel-ring" />
            </g>
          </template>
        </g>
      </g>

      <!-- Regions: their names, once zoomed in a little -->
      <g v-if="showLabels" class="regions" pointer-events="none">
        <text
          v-for="r in atlas.regions"
          :key="`region-${r.id}`"
          class="region-name"
          :class="{ dim: dimCountry(r.countryId) }"
          :transform="`translate(${r.x} ${r.y - 44}) scale(${labelScale})`"
          text-anchor="middle"
        >
          {{ r.name }}
        </text>
      </g>

      <!-- Countries: flag and name, above the towns -->
      <g v-for="c in islands" :key="`flag-${c.id}`" class="country hit" :class="{ dim: dimCountry(c.id) }" @click.stop="pick('country', c.id)">
        <g :transform="`translate(${c.x} ${c.labelY}) scale(${labelScale})`">
          <g transform="translate(0 -6)">
            <rect x="-14" y="-30" width="28" height="9" :fill="c.colors[0]" stroke="#3b2a1a" stroke-width="1.5" rx="1.5" />
            <rect x="-14" y="-21" width="28" height="9" :fill="c.colors[1]" stroke="#3b2a1a" stroke-width="1.5" rx="1.5" />
          </g>
          <text class="country-name" text-anchor="middle">{{ c.name }}</text>
          <text v-if="c.founder" class="country-sub" y="16" text-anchor="middle">founded by {{ c.founder }}</text>
          <text v-else-if="!c.towns" class="country-sub" y="16" text-anchor="middle">unsettled</text>
        </g>
      </g>

      <!-- Where a new country / town would go -->
      <g v-if="ghost" class="ghost" :class="{ bad: !!ghost.problem }" :transform="`translate(${ghost.x} ${ghost.y})`" pointer-events="none">
        <circle :r="placing === 'country' ? 60 : 16" class="ghost-area" />
        <g :transform="`scale(${sym})`">
          <path d="M0 0 V-30" stroke="#5e3b22" stroke-width="3" />
          <path d="M0 -30 h22 v14 h-22 z" :fill="ghost.problem ? '#e5402f' : '#5cc23a'" stroke="#3b2a1a" stroke-width="1.5" />
          <text y="22" text-anchor="middle" class="ghost-text">{{ ghost.problem ?? (placing === 'country' ? 'Found your country here' : 'Found your town here') }}</text>
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

    <div class="atlas-zoom">
      <button class="roundbtn" aria-label="Zoom in" @click="zoomBy(1.4)">+</button>
      <button class="roundbtn" aria-label="Zoom out" @click="zoomBy(1 / 1.4)">−</button>
      <button class="roundbtn" aria-label="Whole world" @click="fitAll()" v-html="icon('map')"></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  TOWN_MAX_CLUBS,
  countrySpotProblem,
  townSpotProblem,
  type Atlas,
  type AtlasClub,
  type TownTerrain,
} from '@repo/api-contract';
import { crestUrl } from '@/helpers/crest';
import { icon } from '@/components/cozy/icons';

export interface AtlasVenue {
  id: string;
  x: number;
  y: number;
  label: string;
  icon: string;
  tint: string;
  status?: string;
}
export type AtlasPick = { kind: 'country' | 'town' | 'club' | 'venue'; id: string };

const props = withDefaults(
  defineProps<{
    atlas: Atlas;
    selected?: AtlasPick | null;
    /** Founding mode: clicks on the map propose a spot. */
    placing?: 'country' | 'town' | null;
    /** The country a new town goes in (placing === 'town'). */
    placingCountryId?: string | null;
    /** A chosen spot waiting for its form. */
    pending?: { x: number; y: number } | null;
    /** Fade every other country. */
    focusCountryId?: string | null;
    venues?: AtlasVenue[];
    myClubIds?: Set<string>;
    highlightClubIds?: Set<string>;
    /** Screen pixels covered by panels on each side; the view frames
     * things in the space that's left. */
    insets?: { top?: number; right?: number; bottom?: number; left?: number };
  }>(),
  {
    selected: null,
    placing: null,
    placingCountryId: null,
    pending: null,
    focusCountryId: null,
    venues: () => [],
    myClubIds: () => new Set<string>(),
    highlightClubIds: () => new Set<string>(),
    insets: () => ({}),
  }
);
const emit = defineEmits<{
  (e: 'select', pick: AtlasPick | null): void;
  (e: 'place', spot: { x: number; y: number; problem: string | null }): void;
}>();

const wrap = ref<HTMLDivElement | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const vb = reactive({ x: 0, y: 0, w: props.atlas.width, h: props.atlas.height });
const dragging = ref(false);
const ghost = ref<{ x: number; y: number; problem: string | null } | null>(null);

// --- Looks ----------------------------------------------------------------

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * t + ((pb >> s) & 255) * (1 - t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const TERRAIN_HOUSE: Record<TownTerrain, string> = {
  city: 'M-10 6 V-4 H-3 V-9 H10 V6 Z',
  coastal: 'M-9 6 V-3 H9 V6 Z',
  hillside: 'M-9 6 V-2 H9 V6 Z',
  woodland: 'M-8 6 V-1 H8 V6 Z',
  alpine: 'M-9 6 V-3 H9 V6 Z',
};
const TERRAIN_ROOF: Record<TownTerrain, string> = {
  city: 'M-11 -4 L-6.5 -9 L-2 -4 Z M-4 -9 L3.5 -15 L11 -9 Z',
  coastal: 'M-11 -3 L0 -12 L11 -3 Z',
  hillside: 'M-12 -2 L-3 -13 L3 -7 L7 -11 L12 -2 Z',
  woodland: 'M-10 -1 L0 -15 L10 -1 Z',
  alpine: 'M-13 -3 L0 -11 L13 -3 Z',
};
const ROOF: Record<TownTerrain, string> = {
  city: '#e5402f',
  coastal: '#3a8ee0',
  hillside: '#2f8a1c',
  woodland: '#3f6b3a',
  alpine: '#7a4a2a',
};

const townsByCountry = computed(() => {
  const m = new Map<string, Atlas['towns']>();
  for (const t of props.atlas.towns) m.set(t.countryId, [...(m.get(t.countryId) ?? []), t]);
  return m;
});
const regionsByCountry = computed(() => {
  const m = new Map<string, Atlas['regions']>();
  for (const r of props.atlas.regions ?? []) m.set(r.countryId, [...(m.get(r.countryId) ?? []), r]);
  return m;
});

const islands = computed(() =>
  props.atlas.countries.map((c) => {
    const towns = townsByCountry.value.get(c.id) ?? [];
    // Land joins the capital to each region's heart and every town.
    const regions = regionsByCountry.value.get(c.id) ?? [];
    const blobs = [
      { x: c.x, y: c.y, r: 46 + Math.min(towns.length, 12) * 2.5 },
      ...regions.map((r) => ({ x: (r.x + c.x) / 2, y: (r.y + c.y) / 2, r: 34 })),
      ...regions.filter((r) => towns.some((t) => t.regionId === r.id)).map((r) => ({ x: r.x, y: r.y, r: 36 })),
      ...towns.map((t) => ({ x: t.x, y: t.y, r: 30 })),
    ];
    const top = Math.min(c.y - blobs[0]!.r, ...towns.map((t) => t.y - 30));
    const greens = ['#9bd46e', '#8fcf63', '#a6d977', '#93cc6a'];
    const h = hash(c.id);
    const trees = Array.from({ length: 5 + Math.min(towns.length, 10) }, (_, i) => {
      const hi = hash(`${c.id}:${i}`);
      const anchor = blobs[hi % blobs.length]!;
      const a = ((hi >>> 4) % 360) * (Math.PI / 180);
      const r = anchor.r * (0.45 + ((hi >>> 12) % 40) / 100);
      return { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r, s: 0.8 + ((hi >>> 20) % 5) / 10, dark: (hi & 1) === 1 };
    }).filter((t) => towns.every((tw) => Math.hypot(tw.x - t.x, tw.y - t.y) > 18) && Math.hypot(c.x - t.x, c.y - t.y) > 16);
    return {
      ...c,
      founder: c.founder?.name ?? null,
      land: mix(c.colors[0], greens[h % greens.length]!, 0.1),
      towns: towns.length,
      blobs,
      trees,
      labelY: top - 8,
    };
  })
);

const zoom = computed(() => props.atlas.width / vb.w);
/** Pins and labels grow a little on screen as you zoom in, but shrink
 * against the land, so they never swamp the map. */
const sym = computed(() => zoom.value ** -0.72);
const labelScale = computed(() => zoom.value ** -0.78);
const showCrests = computed(() => zoom.value >= 1.7);
const showTownNames = computed(() => zoom.value >= 1.5);
const showLabels = computed(() => zoom.value >= 1.1);

const townViews = computed(() =>
  props.atlas.towns.map((t) => {
    // Club lists come only for a small world or the focused country; the
    // count is always there.
    const n = t.clubs.length;
    // Crests fan out in an arc above their town (symbol units, inside the
    // scaled group), leaving the name below the house clear.
    const ring = 26 + Math.max(0, n - 2) * 3;
    const span = Math.min(Math.PI, (n - 1) * 0.75);
    const pins = t.clubs.map((club: AtlasClub, i: number) => {
      const a = -Math.PI / 2 + (n > 1 ? -span / 2 + (i * span) / (n - 1) : 0);
      return { club, x: Math.cos(a) * ring, y: Math.sin(a) * ring - 4 };
    });
    return { ...t, roof: ROOF[t.terrain], pins, full: t.clubCount >= TOWN_MAX_CLUBS };
  })
);

const dimCountry = (id: string) => !!props.focusCountryId && props.focusCountryId !== id;
const isSelected = (kind: AtlasPick['kind'], id: string) => props.selected?.kind === kind && props.selected.id === id;

// --- Interaction ------------------------------------------------------------

function toWorld(clientX: number, clientY: number) {
  const el = svg.value;
  const m = el?.getScreenCTM();
  if (!el || !m) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function spotProblem(spot: { x: number; y: number }) {
  if (props.placing === 'country') return countrySpotProblem(spot, props.atlas.countries);
  const country = props.atlas.countries.find((c) => c.id === props.placingCountryId);
  if (!country) return 'Pick a country first';
  return townSpotProblem(
    spot,
    country,
    props.atlas.towns,
    props.atlas.countries.filter((c) => c.id !== country.id)
  );
}

function pick(kind: AtlasPick['kind'], id: string) {
  if (moved || props.placing) return;
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
    pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), w: vb.w };
  } else start = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
}

function onMove(e: PointerEvent) {
  if (props.placing && pointers.size === 0) {
    const p = toWorld(e.clientX, e.clientY);
    ghost.value = { ...p, problem: spotProblem(p) };
  }
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    const mid = toWorld((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
    setWidth(pinch.w * (pinch.d / Math.max(d, 1)), mid);
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
  const k = scale();
  vb.x = start.vx - dx * k;
  vb.y = start.vy - dy * k;
  clampView();
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
    // Let the click that follows a drag through to nobody.
    setTimeout(() => (moved = false), 0);
    return;
  }
  if (props.placing) {
    const p = toWorld(e.clientX, e.clientY);
    emit('place', { ...p, problem: spotProblem(p) });
    return;
  }
  // A click on bare land or sea clears the selection; pins stop propagation.
  const target = e.target as Element;
  if (!target.closest('.hit')) emit('select', null);
}

/** Atlas units per screen pixel. */
function scale() {
  const r = svg.value?.getBoundingClientRect();
  if (!r?.width) return 1;
  return Math.max(vb.w / r.width, vb.h / r.height);
}

function clampView() {
  const W = props.atlas.width;
  const H = props.atlas.height;
  vb.x = Math.min(W - vb.w * 0.25, Math.max(-vb.w * 0.75, vb.x));
  vb.y = Math.min(H - vb.h * 0.25, Math.max(-vb.h * 0.75, vb.y));
}

/** Height/width of the SVG on screen; the view box always matches it. */
function aspect() {
  const r = svg.value?.getBoundingClientRect();
  return r?.width ? r.height / r.width : props.atlas.height / props.atlas.width;
}

function setWidth(w: number, around: { x: number; y: number }) {
  const W = props.atlas.width;
  const nw = Math.min(W * 1.6, Math.max(W / 9, w));
  const k = nw / vb.w;
  vb.x = around.x - (around.x - vb.x) * k;
  vb.y = around.y - (around.y - vb.y) * (nw * aspect()) / vb.h;
  vb.w = nw;
  vb.h = nw * aspect();
  clampView();
}

function onWheel(e: WheelEvent) {
  setWidth(vb.w * Math.exp(e.deltaY * 0.0015), toWorld(e.clientX, e.clientY));
}

function zoomBy(f: number) {
  setWidth(vb.w / f, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
}

let anim = 0;
/** Glide the view so `box` (atlas units) fills the screen space left
 * between the insets. */
function flyTo(box: { x: number; y: number; w: number; h: number }) {
  const r = svg.value?.getBoundingClientRect();
  const sw = r?.width || 1;
  const sh = r?.height || 1;
  const { top = 0, right = 0, bottom = 0, left = 0 } = props.insets;
  const uw = Math.max(sw - left - right, sw * 0.3);
  const uh = Math.max(sh - top - bottom, sh * 0.3);
  const W = props.atlas.width;
  const k = Math.min(W * 1.6 / sw, Math.max(W / 9 / sw, box.w / uw, box.h / uh));
  const target = {
    x: box.x + box.w / 2 - (left + uw / 2) * k,
    y: box.y + box.h / 2 - (top + uh / 2) * k,
    w: sw * k,
    h: sh * k,
  };
  const from = { ...vb };
  const t0 = performance.now();
  cancelAnimationFrame(anim);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 450);
    const k = 1 - (1 - t) ** 3;
    vb.x = from.x + (target.x - from.x) * k;
    vb.y = from.y + (target.y - from.y) * k;
    vb.w = from.w + (target.w - from.w) * k;
    vb.h = from.h + (target.h - from.h) * k;
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

function fitAll() {
  flyTo({ x: 40, y: 40, w: props.atlas.width - 80, h: props.atlas.height - 80 });
}

function focusCountry(id: string) {
  const c = props.atlas.countries.find((x) => x.id === id);
  if (!c) return;
  const pts = [c, ...(townsByCountry.value.get(id) ?? [])];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 120;
  // Extra room on top for the country's name.
  flyTo({ x: Math.min(...xs) - pad, y: Math.min(...ys) - pad - 60, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 + 60 });
}

function focusPoint(x: number, y: number, span = 360) {
  flyTo({ x: x - span / 2, y: y - span / 2, w: span, h: span });
}

watch(
  () => props.placing,
  (p) => {
    if (!p) ghost.value = null;
  }
);

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('select', null);
}
// Keep the view box matching the SVG's shape when the window resizes.
let resize: ResizeObserver | null = null;
onMounted(() => {
  window.addEventListener('keydown', onKey);
  vb.h = vb.w * aspect();
  resize = new ResizeObserver(() => {
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;
    vb.h = vb.w * aspect();
    vb.x = cx - vb.w / 2;
    vb.y = cy - vb.h / 2;
  });
  if (svg.value) resize.observe(svg.value);
  requestAnimationFrame(() => fitAll());
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  resize?.disconnect();
  cancelAnimationFrame(anim);
});

defineExpose({ flyTo, fitAll, focusCountry, focusPoint, zoomBy });
</script>

<style scoped>
.atlas {
  position: absolute;
  inset: 0;
  background: #5aaedb;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}
.atlas.dragging {
  cursor: grabbing;
}
.atlas.placing {
  cursor: crosshair;
}
.atlas-svg {
  width: 100%;
  height: 100%;
  display: block;
  font-family: 'Fredoka', system-ui, sans-serif;
}
.island,
.country,
.town {
  transition: opacity 0.25s;
}
.dim {
  opacity: 0.45;
}
.hit {
  cursor: pointer;
}
.placing .hit {
  cursor: crosshair;
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
.region-name.dim {
  opacity: 0.35;
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
.country-sub {
  font-size: 11px;
  font-weight: 600;
  fill: #fffaf0;
  stroke: #3b2a1a;
  stroke-width: 3px;
  paint-order: stroke;
}
.town-name {
  font-size: 10.5px;
  font-weight: 600;
  fill: #3b2a1a;
  stroke: #fffaf0;
  stroke-width: 3px;
  paint-order: stroke;
}
.town:hover .town-name {
  font-size: 12px;
}
.town.full path:first-of-type {
  fill: #f6e7c4;
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
  animation: atlas-spin 6s linear infinite;
}
@keyframes atlas-spin {
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
.venue-status {
  font-size: 9.5px;
  font-weight: 600;
  fill: #fff1c4;
  stroke: #3b2a1a;
  stroke-width: 3px;
  paint-order: stroke;
}
.ghost-area {
  fill: #5cc23a;
  fill-opacity: 0.18;
  stroke: #2f8a1c;
  stroke-width: 2.5;
  stroke-dasharray: 8 6;
}
.ghost.bad .ghost-area {
  fill: #e5402f;
  stroke: #9a2216;
}
.ghost-text {
  font-size: 12px;
  font-weight: 700;
  fill: #fffaf0;
  stroke: #3b2a1a;
  stroke-width: 3.5px;
  paint-order: stroke;
}
.pending {
  animation: atlas-bob 1.2s ease-in-out infinite;
}
@keyframes atlas-bob {
  50% {
    transform: translateY(-4px);
  }
}
.atlas-zoom {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2;
}
.atlas-zoom .roundbtn {
  width: 42px;
  height: 42px;
  font-size: 24px;
  font-weight: 700;
  color: #5e3b22;
}
.atlas-zoom .roundbtn :deep(.ic) {
  width: 24px;
  height: 24px;
}
@media (max-width: 760px) {
  /* Phones pinch to zoom; the buttons move out of the panel's way. */
  .atlas-zoom {
    left: auto;
    right: 8px;
    top: 84px;
    transform: none;
    flex-direction: row;
  }
  .atlas-zoom .roundbtn {
    width: 36px;
    height: 36px;
    font-size: 20px;
  }
}
</style>
