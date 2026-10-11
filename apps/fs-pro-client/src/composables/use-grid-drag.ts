/**
 * A small, accessible pointer drag abstraction for the Pitch Grid (08 §3.2).
 *
 * It deliberately is *not* an HTML5 drag-and-drop: HTML5 DnD is unavailable or
 * awkward on touch, cannot be styled, and drags a ghost image the grid cannot
 * read. Pointer Events work identically with mouse, touch and pen, and the drop
 * target is resolved geometrically against the board's `data-grid-cell`
 * attributes, so the SVG aura/link overlay (which is `pointer-events: none`)
 * never intercepts a drop.
 *
 * This is only the *decorative* input path: click-to-place and the board's
 * keyboard navigation are the accessible equivalents, so a drag is a nicety, not
 * a requirement.
 */
import { onBeforeUnmount, ref, type Ref } from 'vue';
import type { GridPosition } from '@repo/api-contract';
import { cellFromDataset, type GridCell } from '@/helpers/pitch-grid';

/** What the manager is dragging: a squad-rail player. */
export interface GridDragPayload {
  playerId: string;
  position: GridPosition;
}

export interface UseGridDragOptions {
  /** Called on release; `cell` is null when released outside the board. */
  onDrop: (payload: GridDragPayload, cell: GridCell | null) => void;
  /** Called when a drag is abandoned (Escape, pointer cancel). */
  onCancel?: () => void;
}

export interface UseGridDrag {
  /** Non-null while a drag is in flight (drives the floating ghost). */
  dragging: Ref<GridDragPayload | null>;
  /** The cell currently under the pointer, when it is a live cell. */
  hoverCell: Ref<GridCell | null>;
  /** The pointer position, for positioning the ghost. */
  point: Ref<{ x: number; y: number } | null>;
  /** Begin a drag from a rail item's `pointerdown`. */
  begin: (payload: GridDragPayload, event: PointerEvent) => void;
}

const CELL_SELECTOR = '[data-grid-cell]';

/** Resolve the cell under a viewport point (null outside the board). */
function cellAtPoint(x: number, y: number): GridCell | null {
  if (typeof document === 'undefined') return null;
  const el = document.elementFromPoint(x, y);
  const cellEl = el?.closest(CELL_SELECTOR);
  const dataset = (cellEl as HTMLElement | null)?.dataset ?? null;
  return cellFromDataset(dataset);
}

export function useGridDrag(options: UseGridDragOptions): UseGridDrag {
  const dragging = ref<GridDragPayload | null>(null);
  const hoverCell = ref<GridCell | null>(null);
  const point = ref<{ x: number; y: number } | null>(null);

  function cleanup() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    dragging.value = null;
    hoverCell.value = null;
    point.value = null;
  }

  function onMove(e: PointerEvent) {
    point.value = { x: e.clientX, y: e.clientY };
    hoverCell.value = cellAtPoint(e.clientX, e.clientY);
  }

  function onUp(e: PointerEvent) {
    const payload = dragging.value;
    const cell = cellAtPoint(e.clientX, e.clientY);
    cleanup();
    if (payload) options.onDrop(payload, cell);
  }

  function onCancel() {
    cleanup();
    options.onCancel?.();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  }

  function begin(payload: GridDragPayload, event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    dragging.value = payload;
    point.value = { x: event.clientX, y: event.clientY };
    hoverCell.value = cellAtPoint(event.clientX, event.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  }

  onBeforeUnmount(cleanup);

  return { dragging, hoverCell, point, begin };
}
