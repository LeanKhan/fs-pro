<template>
  <div class="pg-editor" :class="{ readonly }">
    <header class="pg-head">
      <div class="pg-title">
        <h2>
          <span class="ic" v-html="icon('map')"></span>
          {{ heading }}
        </h2>
        <p v-if="!readonly" class="pg-sub">
          Drag a player onto a cell, or tap a player then a cell. One starter
          per cell, one keeper in X0.
        </p>
        <p v-else class="pg-sub">{{ modeBlurb }}</p>
      </div>

      <nav v-if="!readonly" class="pg-slots" aria-label="Layout slot">
        <button
          v-for="s in LAYOUT_SLOTS"
          :key="s"
          :class="{ on: s === slot }"
          @click="selectSlot(s)"
        >
          {{ SLOT_LABELS[s] }}
        </button>
      </nav>
      <div v-else class="pg-tier-chip">Clubhouse T{{ tier }}</div>
    </header>

    <div v-if="loading" class="pg-state">Opening the tactics board…</div>
    <div v-else-if="loadError" class="pg-state bad">{{ loadError }}</div>

    <div v-else class="pg-main">
      <section class="pg-field" aria-label="Pitch">
        <div class="pg-toolbar" v-if="!readonly">
          <label class="pg-presets">
            <span>Preset</span>
            <select :value="''" @change="onPresetChange">
              <option value="" disabled>Start from…</option>
              <option v-for="p in GRID_PRESETS" :key="p.id" :value="p.id">
                {{ p.name }} (T{{ presetMinTier(p) }})
              </option>
            </select>
          </label>
          <button class="btn small" :disabled="!holding" @click="cancelHolding">
            Put back
          </button>
          <button class="btn small" :disabled="!slots.length" @click="clearAll">
            Clear
          </button>
          <button
            class="btn small primary"
            :disabled="!canSave"
            :title="canSave ? '' : (validationReason ?? '')"
            @click="save"
          >
            {{ busy === 'save' ? 'Saving…' : 'Save ' + SLOT_LABELS[slot] }}
          </button>
          <button
            class="btn small"
            :disabled="busy === 'validate'"
            @click="validateOnServer"
          >
            Verify
          </button>
        </div>

        <pitch-grid-board
          :slots="slots"
          :preview="preview"
          :tier="tier"
          :readonly="readonly"
          :held="boardHeld"
          :locked-reason="GRID_REASON.lockedColumn"
          :threat-occupancy="props.threatOccupancy ?? null"
          :player-info="playerInfo"
          @cell="onCell"
        />

        <p
          class="pg-status"
          :class="{ bad: !!validationReason }"
          role="status"
          aria-live="polite"
        >
          <template v-if="readonly">Read-only.</template>
          <template v-else-if="validationReason">
            {{ validationReason }}
          </template>
          <template v-else>
            Shape is legal — {{ slots.length }}/{{ GRID_STARTERS }} placed.
          </template>
        </p>
        <p v-if="!readonly && dropHint" class="pg-hint">{{ dropHint }}</p>
        <p
          v-if="liveNotice"
          class="pg-notice"
          :class="liveNotice.level"
          role="status"
        >
          {{ liveNotice.text }}
        </p>
      </section>

      <aside v-if="!readonly" class="pg-rail" aria-label="Squad">
        <h3>
          Squad
          <small>{{ rail.length }} available</small>
        </h3>
        <ul>
          <li v-for="c in rail" :key="c.id">
            <button
              class="pg-player"
              :class="{ on: selectedRailId === c.id }"
              :aria-pressed="selectedRailId === c.id"
              @pointerdown="startDrag(c, $event)"
              @click="holdRail(c)"
            >
              <span class="pg-pos" :class="`pos-${c.position.toLowerCase()}`">
                {{ c.position }}
              </span>
              <span class="pg-name">{{ nameOfCandidate(c.id) }}</span>
              <span class="pg-rate">{{ Math.round(c.rating) }}</span>
            </button>
          </li>
          <li v-if="!rail.length" class="pg-empty">
            Everyone is on the pitch.
          </li>
        </ul>

        <div class="pg-share">
          <h3>Share code</h3>
          <div class="pg-share-row">
            <button
              class="btn tiny"
              :disabled="busy === 'publish' || !storedGrid"
              @click="publish"
            >
              {{ busy === 'publish' ? '…' : 'Publish' }}
            </button>
            <code v-if="publishedCode" class="pg-code">
              {{ publishedCode }}
            </code>
          </div>
          <div class="pg-share-row">
            <input
              v-model="importCode"
              class="pg-input"
              placeholder="Paste a code"
              aria-label="Share code to import"
            />
            <button
              class="btn tiny"
              :disabled="busy === 'import' || !importCode"
              @click="importLayout"
            >
              {{ busy === 'import' ? '…' : 'Clone' }}
            </button>
          </div>
          <p class="pg-hint">
            Cloning a code is validated at your Clubhouse tier — the server
            wins.
          </p>
        </div>
      </aside>
    </div>

    <div
      v-if="dragging"
      class="pg-ghost"
      :style="{ left: `${point?.x ?? 0}px`, top: `${point?.y ?? 0}px` }"
      aria-hidden="true"
    >
      {{ nameOfCandidate(dragging.playerId) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import {
  GRID_STARTERS,
  LAYOUT_SLOTS,
  validateGrid,
  type Club,
  type GridPosition,
  type GridSlot,
  type LayoutSlot,
  type Layouts,
  type Player,
} from '@repo/api-contract';
import { client } from '@/services/api';
import { icon } from '@/components/cozy/icons';
import PitchGridBoard from '@/components/cozy/grid/pitch-grid-board.vue';
import { useGridDrag } from '@/composables/use-grid-drag';
import {
  buildPreview,
  canPlace,
  coercePreview,
  columnLabel,
  GRID_REASON,
  gridFromSlots,
  gridSignature,
  rowLabel,
  type GridCell,
  type GridPreview,
} from '@/helpers/pitch-grid';
import {
  candidateFromPlayer,
  GRID_PRESETS,
  presetMinTier,
  presetToGrid,
  type GridPreset,
  type SquadCandidate,
} from '@/helpers/pitch-grid-presets';

/**
 * The Pitch Grid editor (docs/coc-mapping/08 §3): the flagship client surface.
 * One renderer, three modes — `edit` (own club), `scout` and `review` (both
 * read-only). Validity is server-authoritative and mirrored: the `Save`/`Verify`
 * paths call the typed `grid.*` routes, while the aura/link/synergy read is the
 * local advisory preview (`@/helpers/pitch-grid`), reconciled whenever the
 * server returns its own.
 *
 * No Vuetify: plain HTML/CSS + the cozy tokens.
 */

const props = withDefaults(
  defineProps<{
    clubId: string;
    /** `edit` for your own club; `scout`/`review` render read-only. */
    mode?: 'edit' | 'scout' | 'review';
    /** Preloaded club (the campus hub already has it) — avoids a second fetch. */
    club?: Club | null;
    /** Override the grid to render (scout/review of an external shape). */
    externalGrid?: { slots: GridSlot[] } | null;
    externalTier?: number;
    /** Optional heading (e.g. the opponent's name in scout mode). */
    heading?: string;
    /** Scout read: outfield occupancy per column X0..X8. */
    threatOccupancy?: number[] | null;
  }>(),
  {
    mode: 'edit',
    club: null,
    externalGrid: null,
    externalTier: undefined,
    heading: undefined,
    threatOccupancy: null,
  }
);

const emit = defineEmits<{
  (e: 'toast', text: string, level?: 'success' | 'error'): void;
  (e: 'saved'): void;
}>();

const SLOT_LABELS: Record<LayoutSlot, string> = {
  home: 'Home',
  match: 'Match',
  derby: 'Derby',
};

const readonly = computed(() => props.mode !== 'edit');

// --- Data: the stored layouts + the squad ------------------------------------

const loading = ref(true);
const loadError = ref<string | null>(null);
const slot = ref<LayoutSlot>('home');
const tier = ref(1);
const layouts = ref<Layouts>({});
const slots = ref<GridSlot[]>([]);
const busy = ref<'save' | 'validate' | 'publish' | 'import' | null>(null);
const publishedCode = ref('');
const importCode = ref('');

const clubQuery = useQuery({
  queryKey: computed(() => ['grid-club', props.clubId]),
  queryFn: async () => {
    const res = await client.clubs.getClub.query({
      params: { id: props.clubId },
      query: { populate: 'true' },
    });
    if (res.status !== 200) throw new Error(res.body.message);
    return res.body.payload;
  },
  enabled: computed(() => !props.club && !readonly.value),
});

const roster = computed<readonly Player[]>(
  () => props.club?.Players ?? clubQuery.data.value?.Players ?? []
);

const candidates = computed<SquadCandidate[]>(() =>
  roster.value
    .map((p) => candidateFromPlayer(p))
    .filter((c): c is SquadCandidate => c !== null)
);

const starters = computed(() => new Set(slots.value.map((s) => s.playerId)));

const POS_ORDER: Record<GridPosition, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  ATT: 3,
};
const rail = computed(() =>
  candidates.value
    .filter((c) => !starters.value.has(c.id))
    .sort(
      (a, b) =>
        POS_ORDER[a.position] - POS_ORDER[b.position] || b.rating - a.rating
    )
);

const playerInfo = computed<
  Record<string, { name: string; shirt: string | null }>
>(() => {
  const out: Record<string, { name: string; shirt: string | null }> = {};
  for (const p of roster.value) {
    if (!p._id) continue;
    const name =
      `${p.FirstName ?? ''} ${p.LastName ?? ''}`.trim() ||
      p.LastName ||
      'Player';
    const shirt =
      p.ShirtNumber === undefined || p.ShirtNumber === null
        ? null
        : String(p.ShirtNumber);
    out[p._id] = { name, shirt };
  }
  return out;
});

function nameOfCandidate(id: string): string {
  return playerInfo.value[id]?.name ?? 'Player';
}

// --- The draft: preview (advisory) + validation (mirrored contract) ----------

const draft = computed(() => gridFromSlots(slots.value));
const validationReason = computed(() => validateGrid(draft.value, tier.value));
const canSave = computed(
  () => !readonly.value && !busy.value && validationReason.value === null
);

/** The server's advisory preview, only while it still matches the draft. */
const serverPreview = ref<{ signature: string; preview: GridPreview } | null>(
  null
);
const clientPreview = computed(() => buildPreview(slots.value));
const preview = computed<GridPreview>(() => {
  const cached = serverPreview.value;
  if (cached && cached.signature === gridSignature(slots.value))
    return cached.preview;
  return clientPreview.value;
});

const heading = computed(() => props.heading ?? 'Pitch grid');
const modeBlurb = computed(() =>
  props.mode === 'scout'
    ? 'Scouting read of this club’s Home Grid — where they hold space, and how they link.'
    : 'Replay review of the shape that was used.'
);

// --- Notices -----------------------------------------------------------------

const liveNotice = ref<{ text: string; level: 'success' | 'error' } | null>(
  null
);
function notify(text: string, level: 'success' | 'error' = 'success') {
  liveNotice.value = { text, level };
  emit('toast', text, level);
}
function clearNotice() {
  liveNotice.value = null;
}

// --- Placing: holding state, click-to-place, drag-and-drop -------------------

interface Holding {
  playerId: string;
  position: GridPosition;
  from: 'rail' | 'board';
}
const holding = ref<Holding | null>(null);
const selectedRailId = ref<string | null>(null);

/** The board highlights the held slot only when it came from the board. */
const boardHeld = computed<GridSlot | null>(() => {
  if (!holding.value || holding.value.from !== 'board') return null;
  return (
    slots.value.find((s) => s.playerId === holding.value!.playerId) ?? null
  );
});

const dropHint = computed(() => {
  const target = hoverCell.value;
  if (!dragging.value || !target) return '';
  return `Drop ${nameOfCandidate(dragging.value.playerId)} into ${columnLabel(target.col)} ${rowLabel(target.row)}`;
});

function holdRail(c: SquadCandidate) {
  if (readonly.value) return;
  clearNotice();
  holding.value = { playerId: c.id, position: c.position, from: 'rail' };
  selectedRailId.value = c.id;
}

function cancelHolding() {
  holding.value = null;
  selectedRailId.value = null;
  clearNotice();
}

function attemptPlace(source: Holding, cell: GridCell) {
  const check = canPlace(slots.value, cell, source.position, tier.value);
  if (!check.ok) {
    notify(check.reason ?? 'That placement is not allowed.', 'error');
    return;
  }
  // Replacing the cell clears its occupant; moving from the board clears the
  // source cell too, so a slot is never duplicated.
  let next = slots.value.filter(
    (s) => !(s.col === cell.col && s.row === cell.row)
  );
  if (source.from === 'board')
    next = next.filter((s) => s.playerId !== source.playerId);
  next = [
    ...next,
    {
      col: cell.col,
      row: cell.row,
      playerId: source.playerId,
      position: source.position,
    },
  ];
  slots.value = next;
  cancelHolding();
}

function onCell(payload: { cell: GridCell; slot: GridSlot | null }) {
  if (readonly.value) return;
  clearNotice();
  if (holding.value) {
    attemptPlace(holding.value, payload.cell);
    return;
  }
  if (payload.slot) {
    holding.value = {
      playerId: payload.slot.playerId,
      position: payload.slot.position,
      from: 'board',
    };
    selectedRailId.value = null;
  }
}

const { dragging, hoverCell, point, begin } = useGridDrag({
  onDrop: (payload, cell) => {
    if (!cell) return cancelHolding();
    attemptPlace(
      { playerId: payload.playerId, position: payload.position, from: 'rail' },
      cell
    );
  },
  onCancel: cancelHolding,
});

function startDrag(c: SquadCandidate, e: PointerEvent) {
  if (readonly.value) return;
  holdRail(c);
  begin({ playerId: c.id, position: c.position }, e);
}

// --- Presets -----------------------------------------------------------------

function onPresetChange(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  const preset = GRID_PRESETS.find((p) => p.id === id);
  if (preset) applyPreset(preset);
  (e.target as HTMLSelectElement).value = '';
}

function applyPreset(preset: GridPreset) {
  clearNotice();
  slots.value = presetToGrid(preset, candidates.value);
  cancelHolding();
  if (!slots.value.length) {
    notify('No fit, un-injured players for that preset yet.', 'error');
    return;
  }
  const required = presetMinTier(preset);
  if (required > tier.value) {
    notify(
      `${preset.name} needs Clubhouse Tier ${required}. ${GRID_REASON.lockedColumn}.`,
      'error'
    );
  } else {
    notify(`${preset.name} loaded — drag to make it yours.`);
  }
}

function clearAll() {
  slots.value = [];
  cancelHolding();
}

// --- Server: save, verify, share codes ---------------------------------------

function loadSlotsIntoDraft() {
  const stored = layouts.value[slot.value];
  slots.value = stored ? stored.slots.map((s) => ({ ...s })) : [];
  serverPreview.value = null;
}

async function load() {
  loading.value = true;
  loadError.value = null;
  if (props.externalGrid) {
    tier.value = props.externalTier ?? 1;
    slots.value = props.externalGrid.slots.map((s) => ({ ...s }));
    loading.value = false;
    return;
  }
  const res = await client.grid.getLayouts.query({
    params: { id: props.clubId },
  });
  if (res.status !== 200) {
    loadError.value = res.body.message;
    loading.value = false;
    return;
  }
  layouts.value = res.body.payload.layouts;
  tier.value = props.externalTier ?? res.body.payload.tier;
  loadSlotsIntoDraft();
  loading.value = false;
}

const storedGrid = computed(() => {
  const stored = layouts.value[slot.value];
  return stored && stored.slots.length ? stored : null;
});

function selectSlot(s: LayoutSlot) {
  if (s === slot.value) return;
  slot.value = s;
  clearNotice();
  cancelHolding();
  loadSlotsIntoDraft();
}

async function save() {
  if (!canSave.value) return;
  busy.value = 'save';
  clearNotice();
  try {
    const res = await client.grid.putLayout.mutation({
      params: { id: props.clubId, slot: slot.value },
      body: { grid: draft.value },
    });
    if (res.status !== 200) {
      notify(res.body.message, 'error');
      return;
    }
    // Server wins: adopt the persisted grid and tier verbatim.
    layouts.value = { ...layouts.value, [slot.value]: res.body.payload.grid };
    tier.value = res.body.payload.tier;
    slots.value = res.body.payload.grid.slots.map((s) => ({ ...s }));
    serverPreview.value = null;
    notify(`${SLOT_LABELS[slot.value]} grid saved.`);
    emit('saved');
  } finally {
    busy.value = null;
  }
}

async function validateOnServer() {
  busy.value = 'validate';
  clearNotice();
  try {
    const res = await client.grid.validateLayout.mutation({
      params: { id: props.clubId },
      body: { grid: draft.value },
    });
    if (res.status !== 200) {
      notify(res.body.message, 'error');
      return;
    }
    tier.value = res.body.payload.tier;
    if (!res.body.payload.valid) {
      notify(
        res.body.payload.reason ?? 'The server refused that shape.',
        'error'
      );
      return;
    }
    const parsed = coercePreview(res.body.payload.preview);
    if (parsed) {
      serverPreview.value = {
        signature: gridSignature(slots.value),
        preview: parsed,
      };
      notify('Verified — the server agrees with this preview.');
    } else {
      notify('Verified legal. Preview stayed client-side.');
    }
  } finally {
    busy.value = null;
  }
}

async function publish() {
  busy.value = 'publish';
  clearNotice();
  try {
    const res = await client.grid.publishLayout.mutation({
      params: { id: props.clubId, slot: slot.value },
      body: {},
    });
    if (res.status !== 200) {
      notify(res.body.message, 'error');
      return;
    }
    publishedCode.value = res.body.payload.code;
    notify(`Published as ${res.body.payload.code}.`);
  } finally {
    busy.value = null;
  }
}

async function importLayout() {
  const code = importCode.value.trim();
  if (!code) return;
  busy.value = 'import';
  clearNotice();
  try {
    const res = await client.grid.importLayout.mutation({
      body: { code, clubId: props.clubId, slot: slot.value },
    });
    if (res.status !== 200) {
      notify(res.body.message, 'error');
      return;
    }
    // The server validated against this club's tier: adopt its grid (server wins).
    layouts.value = { ...layouts.value, [slot.value]: res.body.payload.grid };
    tier.value = res.body.payload.tier;
    slots.value = res.body.payload.grid.slots.map((s) => ({ ...s }));
    serverPreview.value = null;
    importCode.value = '';
    notify(`Cloned ${code} into ${SLOT_LABELS[slot.value]}.`);
    emit('saved');
  } finally {
    busy.value = null;
  }
}

// --- Presentation helpers used by the template -------------------------------

onMounted(load);
watch(() => props.clubId, load);
</script>

<style scoped>
.pg-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.pg-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.pg-title h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 22px;
}
.pg-title .ic {
  width: 26px;
  height: 26px;
}
.pg-sub {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--muted, #6f5940);
  max-width: 60ch;
}
.pg-tier-chip {
  padding: 4px 12px;
  border-radius: 999px;
  background: linear-gradient(#fff8e6, #f1dfb6);
  border: 2px solid #e2cc9c;
  font-weight: 700;
}
.pg-slots {
  display: flex;
  gap: 6px;
}
.pg-slots button {
  padding: 5px 14px;
  border-radius: 10px;
  font-weight: 700;
  border: 2px solid #e2cc9c;
  background: #fffaf0;
}
.pg-slots button.on {
  background: var(--green, #5cc23a);
  border-color: var(--green-d, #2f8a1c);
  color: #fff;
}
.pg-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
  gap: 16px;
  align-items: start;
}
@media (max-width: 760px) {
  .pg-main {
    grid-template-columns: 1fr;
  }
}
.pg-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.pg-presets {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.pg-presets select {
  font: inherit;
  padding: 5px 8px;
  border-radius: 10px;
  border: 2px solid #c9a46a;
  background: #fffaf0;
  color: inherit;
}
.pg-status {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--green-d, #2f8a1c);
}
.pg-status.bad {
  color: var(--red, #e5402f);
}
.pg-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.pg-notice {
  margin: 6px 0 0;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  background: #e9f7e2;
  border: 2px solid var(--green, #5cc23a);
}
.pg-notice.error {
  background: #fbe0dc;
  border-color: var(--red, #e5402f);
  color: #7a2015;
}
.pg-rail {
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  border-radius: 14px;
  padding: 10px;
}
.pg-rail h3 {
  margin: 0 0 8px;
  font-size: 16px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.pg-rail h3 small {
  font-size: 11px;
  color: var(--muted, #6f5940);
  font-weight: 500;
}
.pg-rail ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow: auto;
}
.pg-player {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border-radius: 9px;
  border: 2px solid transparent;
  background: rgba(138, 90, 59, 0.08);
  text-align: left;
  cursor: grab;
  touch-action: none;
}
.pg-player:hover {
  background: rgba(138, 90, 59, 0.16);
}
.pg-player.on {
  border-color: var(--gold, #f5b82e);
  background: rgba(245, 184, 46, 0.22);
}
.pg-pos {
  font-size: 10px;
  font-weight: 800;
  text-align: center;
  padding: 2px 0;
  border-radius: 5px;
  color: #fff;
  background: #8a5a3b;
}
.pg-pos.pos-gk {
  background: #b97f0f;
}
.pg-pos.pos-def {
  background: #3a6fd8;
}
.pg-pos.pos-mid {
  background: #2f8a1c;
}
.pg-pos.pos-att {
  background: #c2341f;
}
.pg-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pg-rate {
  font-weight: 800;
  color: var(--wood-d, #5e3b22);
}
.pg-empty {
  font-size: 12px;
  color: var(--muted, #6f5940);
  padding: 6px 2px;
}
.pg-share {
  margin-top: 12px;
  border-top: 2px solid #e2cc9c;
  padding-top: 10px;
}
.pg-share-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.pg-code {
  font-weight: 800;
  letter-spacing: 0.08em;
  background: #f6e7c4;
  padding: 2px 8px;
  border-radius: 6px;
}
.pg-input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 5px 8px;
  border-radius: 8px;
  border: 2px solid #c9a46a;
  background: #fff;
}
.pg-state {
  padding: 18px;
  text-align: center;
  font-size: 16px;
}
.pg-state.bad {
  color: var(--red, #e5402f);
}
.pg-ghost {
  position: fixed;
  z-index: 50;
  transform: translate(-50%, -50%);
  pointer-events: none;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fffaf0;
  border: 2px solid var(--gold, #f5b82e);
  font-size: 13px;
  font-weight: 700;
  color: var(--wood-d, #5e3b22);
  box-shadow: var(--shadow, 0 6px 16px rgba(0, 0, 0, 0.2));
}
@media (prefers-reduced-motion: reduce) {
  .pg-player {
    transition: none;
  }
}
</style>
