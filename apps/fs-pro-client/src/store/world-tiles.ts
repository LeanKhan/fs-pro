import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef } from 'vue';
import type { AtlasChrome, AtlasSearchResult, Tile, TileClub, TilePlace } from '@repo/api-contract';
import { client } from '@/services/api';
import { fetchTile } from '@/services/tiles';
import { unwrap } from '@/store/open-play';

/**
 * The zoomable world map's data layer (docs/perfect/WORLD-HIERARCHY-SPEC.md
 * §7). The Go world-service serves bounded quadtree tiles keyed `z/x/y`; this
 * store owns the viewport and loads exactly the cells the view can see, so the
 * client never holds the whole world (D2). Country headers (flag colours) and
 * the user's founding summary come from the small `/atlas/chrome` endpoint,
 * not the retired whole-world atlas.
 *
 * Pure maths (cell size, zoom<->level) mirror the Go `internal/tiles` package;
 * keep them in step.
 */

const BASE_CELL = 256;
const MIN_Z = 0;
const MAX_Z = 5;
/** Extra cells fetched beyond the viewport so a fast pan does not flash sea. */
const PREFETCH_CELLS = 1;
/** Concurrent tile requests. */
const CONCURRENCY = 6;
/** Bounded cache (~ 20x smaller than the retired atlas at 10k clubs). */
const MAX_CACHED_TILES = 320;
const MIN_W = 24;
const MAX_W = 4200;

export const cellSize = (z: number) => BASE_CELL / 2 ** z;
export const levelForZoom = (z: number): string =>
  z <= 1 ? 'country' : z === 2 ? 'region' : z === 3 ? 'city' : z === 4 ? 'district' : 'club';
/** The integer tile level that best fills the viewport width `w`. */
export const zoomForWidth = (w: number) =>
  Math.max(MIN_Z, Math.min(MAX_Z, Math.round(Math.log2(1024 / Math.max(w, 1)))));
/** The viewport width that frames level `z`'s places. */
export const widthForZoom = (z: number) => 1024 / 2 ** z;

export type PlaceKind = 'country' | 'region' | 'city' | 'district';
export type MapPick = { kind: 'country' | 'region' | 'city' | 'district' | 'club' | 'venue'; id: string };

interface CacheEntry {
  tile: Tile;
  /** The level the client asked for (a tile may return its parent on overflow). */
  requestedZ: number;
}

function keyOf(z: number, x: number, y: number) {
  return `${z}/${x}/${y}`;
}

async function pool(limit: number, tasks: (() => Promise<unknown>)[]) {
  let i = 0;
  const worker = async () => {
    while (i < tasks.length) {
      const task = tasks[i++];
      if (task) await task();
    }
  };
  const running: Promise<void>[] = [];
  for (let n = 0; n < Math.min(limit, tasks.length); n++) running.push(worker());
  await Promise.all(running);
}

export const useWorldTilesStore = defineStore('world-tiles', () => {
  /** Top-left + width of the viewport, in atlas units. Height = width * aspect. */
  const view = reactive({ x: 0, y: 0, w: 1600 });
  const aspect = ref(9 / 16);
  const chrome = ref<AtlasChrome | null>(null);
  const cache = shallowRef(new Map<string, CacheEntry>());
  const searchResults = ref<AtlasSearchResult[]>([]);
  const searching = ref(false);
  const loading = ref(false);
  const error = ref('');
  const ready = ref(false);

  const viewH = computed(() => view.w * aspect.value);
  /** The tile level currently drawn. */
  const z = computed(() => zoomForWidth(view.w));
  const level = computed(() => levelForZoom(z.value));
  const countries = computed(() => chrome.value?.countries ?? []);
  const myClubIds = computed(() => new Set(chrome.value?.me?.clubIds ?? []));
  const myHome = computed(() => chrome.value?.me?.home ?? null);
  const canFoundClub = computed(() => {
    const me = chrome.value?.me;
    return !!me && me.founded.clubs < me.limits.clubs;
  });

  /** The sea that holds every country, from the chrome (never smaller than the
   * old fixed atlas). */
  const worldSize = computed(() => {
    let width = 1600;
    let height = 900;
    for (const c of countries.value) {
      width = Math.max(width, Math.ceil(c.x + 200));
      height = Math.max(height, Math.ceil(c.y + 200));
    }
    return { width, height };
  });

  /** Visible places at the current level, deduped by id. */
  const places = computed<TilePlace[]>(() => {
    const out: TilePlace[] = [];
    const seen = new Set<string>();
    for (const { tile, requestedZ } of cache.value.values()) {
      if (requestedZ !== z.value) continue;
      for (const p of tile.places) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  });

  /** Visible top-K clubs at the current level, deduped by id. */
  const clubs = computed<TileClub[]>(() => {
    const out: TileClub[] = [];
    const seen = new Set<string>();
    for (const { tile, requestedZ } of cache.value.values()) {
      if (requestedZ !== z.value) continue;
      for (const c of tile.clubs) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  });

  const clubCount = computed(() => {
    let n = 0;
    for (const { tile, requestedZ } of cache.value.values()) if (requestedZ === z.value) n += tile.clubCount;
    // Cells overlap the viewport, so this is an upper bound, not a world total.
    return n;
  });

  const placeById = (id: string) => places.value.find((p) => p.id === id);
  const clubById = (id: string) => clubs.value.find((c) => c.id === id) ?? null;

  /** Nearest country to a point (countries do not overlap on the map), used to
   * tint land with its nation's colour at every level. */
  const nationNear = (x: number, y: number) => {
    let best: (typeof countries.value)[number] | null = null;
    let bestD = Infinity;
    for (const c of countries.value) {
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };

  // --- Loading ---------------------------------------------------------------

  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  function clampView() {
    const size = worldSize.value;
    view.w = Math.max(MIN_W, Math.min(MAX_W, view.w));
    const h = viewH.value;
    const minX = -view.w * 0.6;
    const maxX = size.width - view.w * 0.4;
    const minY = -h * 0.6;
    const maxY = size.height - h * 0.4;
    view.x = Math.min(Math.max(view.x, minX), maxX);
    view.y = Math.min(Math.max(view.y, minY), maxY);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 140);
  }

  function setView(v: Partial<{ x: number; y: number; w: number }>) {
    if (v.x !== undefined) view.x = v.x;
    if (v.y !== undefined) view.y = v.y;
    if (v.w !== undefined) view.w = v.w;
    clampView();
    schedule();
  }

  function setAspect(a: number) {
    if (!Number.isFinite(a) || a <= 0) return;
    aspect.value = a;
    clampView();
    schedule();
  }

  /** Drop stale cells so memory stays bounded; keep the newest. */
  function prune() {
    const map = cache.value;
    if (map.size <= MAX_CACHED_TILES) return;
    const keep = new Map<string, CacheEntry>();
    const entries = [...map.entries()];
    for (const [k, e] of entries) {
      if (e.requestedZ === z.value) keep.set(k, e);
    }
    for (const [k, e] of entries) {
      if (keep.size >= MAX_CACHED_TILES) break;
      if (!keep.has(k)) keep.set(k, e);
    }
    cache.value = keep;
  }

  async function refresh() {
    const gen = ++generation;
    const zz = z.value;
    const size = cellSize(zz);
    const margin = PREFETCH_CELLS * size;
    const x0 = Math.max(0, Math.floor((view.x - margin) / size));
    const y0 = Math.max(0, Math.floor((view.y - margin) / size));
    const x1 = Math.floor((view.x + view.w + margin) / size);
    const y1 = Math.floor((view.y + viewH.value + margin) / size);

    const map = cache.value;
    const missing: { z: number; x: number; y: number }[] = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!map.has(keyOf(zz, tx, ty))) missing.push({ z: zz, x: tx, y: ty });
      }
    }
    if (!missing.length) {
      ready.value = true;
      return;
    }

    loading.value = true;
    error.value = '';
    const fetched = new Map(map);
    try {
      await pool(
        CONCURRENCY,
        missing.map((k) => async () => {
          try {
            const tile = await fetchTile(k.z, k.x, k.y);
            if (gen !== generation) return;
            fetched.set(keyOf(k.z, k.x, k.y), { tile, requestedZ: k.z });
          } catch (err) {
            if (gen === generation) error.value = err instanceof Error ? err.message : String(err);
          }
        })
      );
      if (gen === generation) {
        cache.value = fetched;
        ready.value = true;
      }
    } finally {
      if (gen === generation) loading.value = false;
    }
    prune();
  }

  async function loadChrome() {
    try {
      chrome.value = unwrap<AtlasChrome>(await client.atlas.getChrome.query());
      if (!ready.value) fitWorld();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  // --- Navigation ------------------------------------------------------------

  function focusPoint(x: number, y: number, w: number) {
    const nw = Math.max(MIN_W, Math.min(MAX_W, w));
    const nh = nw * aspect.value;
    view.w = nw;
    view.x = x - nw / 2;
    view.y = y - nh / 2;
    clampView();
    schedule();
  }

  function fitWorld() {
    const size = worldSize.value;
    const w = Math.max(size.width, size.height / Math.max(aspect.value, 0.2));
    view.w = w;
    view.x = (size.width - w) / 2;
    view.y = (size.height - w * aspect.value) / 2;
    clampView();
    schedule();
  }

  function zoomBy(f: number, around?: { x: number; y: number }) {
    const centre = around ?? { x: view.x + view.w / 2, y: view.y + viewH.value / 2 };
    const nw = Math.max(MIN_W, Math.min(MAX_W, view.w / f));
    const k = nw / view.w;
    view.x = centre.x - (centre.x - view.x) * k;
    view.y = centre.y - (centre.y - view.y) * k;
    view.w = nw;
    clampView();
    schedule();
  }

  const zoomToKind = (kind: AtlasSearchResult['kind']) =>
    kind === 'country' ? 1 : kind === 'region' ? 2 : kind === 'city' ? 3 : kind === 'district' ? 4 : 5;

  function focusResult(r: AtlasSearchResult) {
    focusPoint(r.x, r.y, widthForZoom(zoomToKind(r.kind)));
  }

  function goToMyClub() {
    const home = myHome.value;
    if (home) focusPoint(home.x, home.y, widthForZoom(5));
    return home;
  }

  async function search(q: string) {
    const term = q.trim();
    if (term.length < 2) {
      searchResults.value = [];
      return;
    }
    searching.value = true;
    try {
      searchResults.value = unwrap<AtlasSearchResult[]>(await client.atlas.search.query({ query: { q: term } }));
    } catch {
      searchResults.value = [];
    } finally {
      searching.value = false;
    }
  }

  function reset() {
    clearTimeout(timer);
    generation++;
    view.x = 0;
    view.y = 0;
    view.w = 1600;
    cache.value = new Map();
    searchResults.value = [];
    error.value = '';
    ready.value = false;
  }

  /** Called in the same transaction as a change, so only changed cells refetch
   * (§7.5). The simplest correct client: drop the cache and refetch the view. */
  function invalidate() {
    cache.value = new Map();
    schedule();
  }

  return {
    // state
    view,
    aspect,
    chrome,
    searchResults,
    searching,
    loading,
    error,
    ready,
    // derived
    viewH,
    z,
    level,
    countries,
    myClubIds,
    myHome,
    canFoundClub,
    worldSize,
    places,
    clubs,
    clubCount,
    placeById,
    clubById,
    nationNear,
    // actions
    setView,
    setAspect,
    refresh,
    loadChrome,
    focusPoint,
    fitWorld,
    zoomBy,
    focusResult,
    goToMyClub,
    search,
    reset,
    invalidate,
  };
});
