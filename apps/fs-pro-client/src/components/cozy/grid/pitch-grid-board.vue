<template>
  <div
    class="pg-board"
    :class="{ readonly, 'is-broken': preview && !preview.connected }"
  >
    <div class="pg-frame">
      <div class="pg-pitch" aria-hidden="true"></div>
      <svg
        class="pg-overlay"
        :viewBox="`0 0 ${GRID.w} ${GRID.h}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect
          v-for="a in auraRects"
          :key="`a-${a.col}-${a.row}`"
          :x="a.col"
          :y="a.row"
          width="1"
          height="1"
          :fill="`rgba(58, 142, 224, ${a.opacity})`"
        />
        <line
          v-for="l in linkLines"
          :key="l.key"
          :x1="l.x1"
          :y1="l.y1"
          :x2="l.x2"
          :y2="l.y2"
          :class="l.broken ? 'pg-link broken' : 'pg-link'"
        />
      </svg>
      <div
        class="pg-cells"
        role="grid"
        :aria-label="`Pitch grid, ${GRID.w} columns by ${GRID.h} rows. Column X0 is your goal.`"
      >
        <button
          v-for="cell in cells"
          :key="cell.key"
          :ref="(el) => setCellRef(cell, el)"
          class="pg-cell"
          :class="cellClass(cell.col, cell.row)"
          role="gridcell"
          :data-grid-cell="true"
          :data-col="cell.col"
          :data-row="cell.row"
          :aria-label="cellAria(cell.col, cell.row)"
          :aria-disabled="isLocked(cell.col) ? 'true' : undefined"
          :tabindex="isFocus(cell) ? 0 : -1"
          @click="onCellActivate(cell.col, cell.row)"
          @keydown="onCellKey($event, cell.col, cell.row)"
        >
          <span
            v-if="slotAt(cell.col, cell.row)"
            class="pg-chip"
            :class="`band-${slotAt(cell.col, cell.row)!.position.toLowerCase()}`"
          >
            <b>{{ shirtOf(slotAt(cell.col, cell.row)!) }}</b>
            <i>{{ nameOf(slotAt(cell.col, cell.row)!) }}</i>
          </span>
          <span v-else-if="isLocked(cell.col)" class="pg-lock">
            <span class="ic" v-html="lockIcon"></span>
          </span>
        </button>
      </div>
    </div>

    <ul v-if="preview" class="pg-legend">
      <li>
        <span class="sw aura"></span>
        Zone of control
      </li>
      <li>
        <span
          class="sw"
          :class="preview.connected ? 'link-ok' : 'link-bad'"
        ></span>
        {{ preview.connected ? 'Passing link' : 'Long ball only' }}
      </li>
      <li>Directness {{ Math.round(preview.directness * 100) }}%</li>
    </ul>

    <div v-if="preview && !preview.connected" class="pg-warn" role="status">
      <span class="ic" v-html="warnIcon"></span>
      Long Ball Only — high turnover risk
    </div>

    <ul v-if="synergyHints.length" class="pg-synergies">
      <li v-for="s in synergyHints" :key="s.id" :title="s.hint">
        <span class="ic" v-html="boltIcon"></span>
        <b>{{ s.name }}</b>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  PITCH_GRID,
  maxColumnForTier,
  type GridSlot,
} from '@repo/api-contract';
import {
  cellKey,
  columnLabel,
  inBounds,
  rowLabel,
  SYNERGY_LABELS,
  type GridCell,
  type GridPreview,
} from '@/helpers/pitch-grid';

/**
 * The read-only-ish pitch board: a 9×7 HTML/CSS grid of cell buttons with an
 * SVG overlay for auras and passing links (08 §3.1). It owns no state beyond
 * focus; the editor owns the draft, validation and preview and passes them in.
 * Works in all three modes — the caller sets `readonly`.
 */

const props = withDefaults(
  defineProps<{
    slots: GridSlot[];
    preview: GridPreview | null;
    tier: number;
    readonly?: boolean;
    /** The slot currently held for moving (highlighted). */
    held?: GridSlot | null;
    /** Exact server reason shown on every locked cell (03 §1.3). */
    lockedReason?: string;
    /** Scout read: outfield occupancy per column X0..X8 (03 §1.7), optional. */
    threatOccupancy?: number[] | null;
    /** Display names / shirt numbers by player id (absent in scout mode). */
    playerInfo?: Record<string, { name: string; shirt: string | null }>;
  }>(),
  {
    readonly: false,
    held: null,
    lockedReason: '',
    threatOccupancy: null,
    playerInfo: undefined,
  }
);

const emit = defineEmits<{
  (e: 'cell', payload: { cell: GridCell; slot: GridSlot | null }): void;
}>();

// Tiny inline icons keep the board dependency-free (no cozy.scss needed).
const ICON_LOCK =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="8" y="14" width="16" height="12" rx="2.5" fill="#8a5a3b" stroke="#5e3b22" stroke-width="2"/><path d="M11 14v-3a5 5 0 0110 0v3" fill="none" stroke="#5e3b22" stroke-width="2.5"/><circle cx="16" cy="20" r="2.2" fill="#f5b82e"/></svg>';
const ICON_WARN =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4l12 22H4z" fill="#e5402f" stroke="#9a2216" stroke-width="2" stroke-linejoin="round"/><path d="M16 12v7" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="23" r="2" fill="#fff"/></svg>';
const ICON_BOLT =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18 3L7 18h8l-2 11 12-16h-8z" fill="#f6d02f" stroke="#b98d0f" stroke-width="2" stroke-linejoin="round"/></svg>';

const GRID = PITCH_GRID;
const lockIcon = ICON_LOCK;
const warnIcon = ICON_WARN;
const boltIcon = ICON_BOLT;

const maxCol = computed(() => maxColumnForTier(props.tier));

const slotByCell = computed(() => {
  const map = new Map<string, GridSlot>();
  for (const s of props.slots) map.set(cellKey(s.col, s.row), s);
  return map;
});

const slotById = computed(() => {
  const map = new Map<string, GridSlot>();
  for (const s of props.slots) if (!map.has(s.playerId)) map.set(s.playerId, s);
  return map;
});

const cells = computed<{ col: number; row: number; key: string }[]>(() => {
  const out: { col: number; row: number; key: string }[] = [];
  for (let row = 0; row < GRID.h; row++) {
    for (let col = 0; col < GRID.w; col++) {
      out.push({ col, row, key: cellKey(col, row) });
    }
  }
  return out;
});

function isLocked(col: number): boolean {
  return col > maxCol.value;
}

function onCellActivate(col: number, row: number) {
  emit('cell', {
    cell: { col, row },
    slot: slotByCell.value.get(cellKey(col, row)) ?? null,
  });
}

// --- Auras & links (drawn from the advisory preview) -------------------------

const auraRects = computed(() => {
  const preview = props.preview;
  if (!preview) return [];
  const out: { col: number; row: number; opacity: number }[] = [];
  for (let row = 0; row < GRID.h; row++) {
    for (let col = 0; col < GRID.w; col++) {
      const value = preview.aura[row * GRID.w + col] ?? 0;
      if (value <= 0) continue;
      out.push({ col, row, opacity: Math.min(0.6, value * 0.16) });
    }
  }
  return out;
});

const linkLines = computed(() => {
  const preview = props.preview;
  if (!preview) return [];
  const broken = !preview.connected;
  return preview.links
    .map((link) => {
      const a = slotById.value.get(link.from);
      const b = slotById.value.get(link.to);
      if (!a || !b) return null;
      return {
        key: `${link.from}-${link.to}`,
        x1: a.col + 0.5,
        y1: a.row + 0.5,
        x2: b.col + 0.5,
        y2: b.row + 0.5,
        broken,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
});

const synergyHints = computed(() =>
  (props.preview?.synergies ?? []).map((id) => ({ id, ...SYNERGY_LABELS[id] }))
);

// --- Cells: labels, bands, focus ---------------------------------------------

function slotAt(col: number, row: number): GridSlot | null {
  return slotByCell.value.get(cellKey(col, row)) ?? null;
}

function infoFor(slot: GridSlot): { name: string; shirt: string | null } {
  return props.playerInfo?.[slot.playerId] ?? { name: '', shirt: null };
}

function nameOf(slot: GridSlot): string {
  const info = infoFor(slot);
  return info.name || slot.position;
}

function shirtOf(slot: GridSlot): string {
  const info = infoFor(slot);
  return info.shirt ?? '·';
}

function threatAt(col: number): number {
  return props.threatOccupancy?.[col] ?? 0;
}

function cellClass(col: number, row: number): Record<string, boolean> {
  const slot = slotAt(col, row);
  return {
    locked: isLocked(col),
    occupied: !!slot,
    held: !!slot && !!props.held && slot.playerId === props.held.playerId,
    keeper: col === 0,
    contend: threatAt(col) > 0,
    'band-def-cell': col >= 1 && col <= 2,
    'band-mid-cell': col >= 3 && col <= 5,
    'band-att-cell': col >= 6,
  };
}

function cellAria(col: number, row: number): string {
  const parts = [`${columnLabel(col)} ${rowLabel(row)}`];
  const slot = slotAt(col, row);
  if (slot) parts.push(`${nameOf(slot)} (${slot.position})`);
  else parts.push('empty');
  if (isLocked(col)) parts.push(`locked — ${props.lockedReason}`);
  else if (threatAt(col) > 0) parts.push('contested zone');
  return parts.join(', ');
}

// Roving tabindex: exactly one cell is tabbable; arrows move focus.
const focus = { col: 0, row: 3 };
function isFocus(cell: { col: number; row: number }): boolean {
  return cell.col === focus.col && cell.row === focus.row;
}

const cellRefs = new Map<string, HTMLElement>();
function setCellRef(cell: { col: number; row: number }, el: unknown) {
  if (el instanceof HTMLElement) cellRefs.set(cellKey(cell.col, cell.row), el);
}

function focusAt(col: number, row: number) {
  if (!inBounds(col, row)) return;
  focus.col = col;
  focus.row = row;
  const el = cellRefs.get(cellKey(col, row));
  el?.focus();
}

function onCellKey(e: KeyboardEvent, col: number, row: number) {
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [col - 1, row],
    ArrowRight: [col + 1, row],
    ArrowUp: [col, row - 1],
    ArrowDown: [col, row + 1],
    Home: [0, row],
    End: [GRID.w - 1, row],
  };
  const move = moves[e.key];
  if (move) {
    e.preventDefault();
    focusAt(move[0], move[1]);
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onCellActivate(col, row);
  }
}
</script>

<style scoped>
.pg-board {
  --pg-cell: 46px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.pg-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 7;
  border-radius: 12px;
  overflow: hidden;
  border: 3px solid #c9a46a;
  background: #2f8a1c;
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.35);
  touch-action: manipulation;
}
/* Mown stripes + thirds, oriented so X0 (your goal) is on the left. */
.pg-pitch {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      to right,
      rgba(255, 255, 255, 0.06) 0 33.33%,
      rgba(0, 0, 0, 0.05) 33.33% 66.66%,
      rgba(255, 255, 255, 0.06) 66.66% 100%
    ),
    repeating-linear-gradient(to right, #3a9a24 0 11.11%, #348c20 11.11% 22.22%);
}
.pg-pitch::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 44.44%;
  width: 2px;
  background: rgba(255, 255, 255, 0.5);
}
.pg-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.pg-link {
  stroke: #fdf4df;
  stroke-width: 0.06;
  stroke-opacity: 0.85;
}
.pg-link.broken {
  stroke: #e5402f;
  stroke-width: 0.09;
  stroke-dasharray: 0.28 0.18;
}
.pg-cells {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(7, 1fr);
}
.pg-cell {
  position: relative;
  margin: 1px;
  padding: 0;
  border-radius: 7px;
  border: 1.5px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font: inherit;
  display: grid;
  place-items: center;
  cursor: pointer;
  overflow: hidden;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}
.pg-cell:hover:not(.locked) {
  background: rgba(255, 255, 255, 0.16);
  border-color: #fff;
}
.pg-cell:focus-visible {
  outline: 3px solid #ffe266;
  outline-offset: -2px;
  z-index: 2;
}
.pg-cell.keeper {
  background: rgba(245, 184, 46, 0.16);
}
.pg-cell.contend {
  box-shadow: inset 0 0 0 2px rgba(229, 64, 47, 0.7);
}
.pg-cell.held {
  border-color: #ffe266;
  background: rgba(255, 226, 102, 0.28);
}
.pg-cell.locked {
  cursor: not-allowed;
  background: repeating-linear-gradient(
    45deg,
    rgba(0, 0, 0, 0.32) 0 6px,
    rgba(0, 0, 0, 0.18) 6px 12px
  );
  border-color: rgba(0, 0, 0, 0.4);
  opacity: 0.85;
}
.pg-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.05;
  max-width: 100%;
}
.pg-chip b {
  font-size: 13px;
  font-weight: 800;
}
.pg-chip i {
  font-size: 9px;
  font-style: normal;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pg-chip.band-gk {
  color: #ffe266;
}
.pg-chip.band-def {
  color: #bcd8ff;
}
.pg-chip.band-mid {
  color: #c8f5b4;
}
.pg-chip.band-att {
  color: #ffc9c0;
}
.pg-lock {
  opacity: 0.75;
  display: inline-flex;
}
.pg-lock .ic {
  width: 16px;
  height: 16px;
}
.pg-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.pg-legend li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sw {
  width: 14px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}
.sw.aura {
  background: rgba(58, 142, 224, 0.5);
}
.sw.link-ok {
  background: #fdf4df;
}
.sw.link-bad {
  background: #e5402f;
}
.pg-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  background: #fbe0dc;
  border: 2px solid #e5402f;
  color: #7a2015;
  font-weight: 700;
  font-size: 13px;
}
.pg-warn .ic {
  width: 18px;
  height: 18px;
  display: inline-flex;
}
.pg-synergies {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pg-synergies li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  background: linear-gradient(#fff8e6, #f1dfb6);
  border: 2px solid #e2cc9c;
  font-size: 12px;
  color: var(--wood-d, #5e3b22);
}
.pg-synergies .ic {
  width: 14px;
  height: 14px;
  display: inline-flex;
}
@media (prefers-reduced-motion: reduce) {
  .pg-cell {
    transition: none;
  }
}
</style>
