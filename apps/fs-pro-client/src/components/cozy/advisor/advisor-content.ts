/**
 * The advisor content model (L9, ADVISOR-SPEC §5, PROGRAM-SERVICE-CONTRACT §6-7).
 *
 * The *line* is authored server-side: step beats in
 * `services/world-service/internal/program/steps.go` and contextual tips in
 * `tips.go`, served on the wire as `AdvisorLine`. This module is the client's
 * deterministic half: it re-exports the wire type, holds the priority bands,
 * and implements the same selection the Go engine documents (priority desc,
 * then id asc; dismissed / max-shows / cooldown / quiet filters) so the queue
 * behaves identically whether a line arrives from the API or from a scripted
 * source in a lab or a test.
 *
 * No LLM, no randomness: selection is a pure function of the candidates, the
 * per-club advisor memory and the clock.
 */
import type { AdvisorExpr, AdvisorLine, AdvisorPose } from '@repo/api-contract';
import { CAMPUS_BUILDINGS, type CampusBuilding } from '@repo/api-contract';

export type { AdvisorExpr, AdvisorLine, AdvisorPose };

/** Priority bands (ADVISOR-SPEC §5.3). Quiet mode still lets ≥70 through. */
export const ADVISOR_BANDS = {
  blocked: 90,
  step: 70,
  tip: 40,
  flavour: 10,
} as const;

/** Quiet mode suppresses tips (priority < 70); program/blocked lines keep speaking. */
export const QUIET_MIN_PRIORITY = 70;

/** Per-club advisor memory, mirrored from the server (L8). */
export interface AdvisorMemory {
  shows: Record<string, number>;
  lastShownAt: Record<string, number>;
  dismissed: string[];
  quiet: boolean;
}

export function emptyMemory(): AdvisorMemory {
  return { shows: {}, lastShownAt: {}, dismissed: [], quiet: false };
}

/** Why a candidate is not eligible (diagnostics + tests). */
export type RejectReason = 'dismissed' | 'max-shows' | 'cooldown' | 'quiet' | 'once';

export interface EligibleResult {
  eligible: boolean;
  reason?: RejectReason;
}

/**
 * The deterministic eligibility test (PROGRAM-SERVICE-CONTRACT §6). `now` is
 * epoch ms. `maxShows === 0` means unlimited.
 */
export function eligible(line: AdvisorLine, memory: AdvisorMemory, now: number): EligibleResult {
  if (memory.dismissed.includes(line.id)) return { eligible: false, reason: 'dismissed' };
  const shown = memory.shows[line.id] ?? 0;
  if (line.once && shown > 0) return { eligible: false, reason: 'once' };
  if (line.maxShows > 0 && shown >= line.maxShows) return { eligible: false, reason: 'max-shows' };
  if (line.cooldownSeconds > 0) {
    const last = memory.lastShownAt[line.id];
    if (last !== undefined && now - last < line.cooldownSeconds * 1000) {
      return { eligible: false, reason: 'cooldown' };
    }
  }
  if (memory.quiet && line.priority < QUIET_MIN_PRIORITY) return { eligible: false, reason: 'quiet' };
  return { eligible: true };
}

/** Priority desc, then id asc — the documented total order. Stable. */
export function byPriorityThenId(a: AdvisorLine, b: AdvisorLine): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Pick the single line to show. Returns null when nothing is eligible. The
 * winner is *not* mutated here — the caller records the show via `recordShow`.
 */
export function selectLine(
  candidates: AdvisorLine[],
  memory: AdvisorMemory,
  now: number
): AdvisorLine | null {
  const ok = candidates.filter((l) => eligible(l, memory, now).eligible);
  if (!ok.length) return null;
  return [...ok].sort(byPriorityThenId)[0] ?? null;
}

/** Merge a step line with contextual tips; the higher priority wins, id breaks ties. */
export function mergeLines(...groups: (AdvisorLine | null | undefined)[][]): AdvisorLine[] {
  return groups.flat().filter((l): l is AdvisorLine => !!l).sort(byPriorityThenId);
}

/** Immutably record one show (max-shows, cooldown, and the once flag read this). */
export function recordShow(memory: AdvisorMemory, id: string, now: number): AdvisorMemory {
  return {
    ...memory,
    shows: { ...memory.shows, [id]: (memory.shows[id] ?? 0) + 1 },
    lastShownAt: { ...memory.lastShownAt, [id]: now },
  };
}

/** Immutably dismiss a rule. Program/blocked lines are never dismissible (§5.5). */
export function recordDismiss(memory: AdvisorMemory, id: string, now: number): AdvisorMemory {
  if (memory.dismissed.includes(id)) return memory;
  return {
    ...memory,
    dismissed: [...memory.dismissed, id],
    lastShownAt: { ...memory.lastShownAt, [id]: now },
  };
}

// ---------------------------------------------------------------------------
// Point targets: an AdvisorLine names an asset type; the campus knows buildings.
// ---------------------------------------------------------------------------

/** Aliases the rule table may use for a building the campus draws. */
const TARGET_ALIASES: Record<string, CampusBuilding> = {
  manager: 'office',
  manager_office: 'office',
  stadium: 'stadium_grounds',
  pitch: 'stadium_grounds',
  training: 'training_ground',
  youth: 'youth_academy',
  medical: 'medical_centre',
  staff: 'staff_house',
};

/** Resolve a line's `target` to a campus building, or null. */
export function targetBuilding(target: string | null | undefined): CampusBuilding | null {
  if (!target) return null;
  if (target in CAMPUS_BUILDINGS) return target as CampusBuilding;
  return TARGET_ALIASES[target] ?? null;
}

/**
 * Force the pose's side from where the target is on screen: the advisor docks
 * bottom-left, so a building to her left must be pointed at with the left arm.
 * `dx` is the target's screen x minus the pointer-hand screen x.
 */
export function sideForTarget(dx: number, fallback: AdvisorPose): AdvisorPose {
  if (fallback === 'idle') return dx < 0 ? 'point-left' : 'point-right';
  if (Math.abs(dx) < 24) return fallback;
  return dx < 0 ? 'point-left' : 'point-right';
}

// ---------------------------------------------------------------------------
// Scripted catalog: the lab + the component's offline/demo mode.
// Texts are the frozen Go strings (steps.go / tips.go) so the demo cannot drift.
// ---------------------------------------------------------------------------

export interface ScriptedLine extends AdvisorLine {}

const base = (
  id: string,
  text: string,
  expr: AdvisorExpr,
  pose: AdvisorPose = 'idle',
  extra: Partial<AdvisorLine> = {}
): ScriptedLine => ({
  id,
  speaker: 'vintra',
  text,
  expr,
  pose,
  target: null,
  priority: 80,
  dismissible: true,
  maxShows: 1,
  cooldownSeconds: 0,
  once: true,
  ...extra,
});

/** A representative line for every expression/pose, for QA and the dev lab. */
export const DEMO_LINES: Record<string, ScriptedLine> = {
  neutral: base(
    'step.manager.arrive',
    'Right then. Every club needs one voice on the training pitch. Spend on a manager first — the rest waits on him.',
    'neutral',
    'idle',
    { priority: 80, once: false, maxShows: 0 }
  ),
  happy: base('step.manager.done.1', "He'll do a job. He won't win you the league.", 'happy', 'idle', {
    priority: 82,
  }),
  excited: base(
    'step.manager.done.3',
    "That's a manager who carries out a brief. Now build him a team.",
    'excited',
    'point-right',
    { priority: 82, target: 'office' }
  ),
  worried: base(
    'tip.squad.afford',
    'The cheapest legal XI is beyond us. Scout, sell, or take the board advance.',
    'worried',
    'idle',
    { priority: 98, dismissible: false, maxShows: 3, cooldownSeconds: 30, once: false }
  ),
  thinking: base(
    'tip.manager.scout',
    "An interview costs V25k. It tells you exactly what you're buying. Skip it and you're guessing.",
    'thinking',
    'idle',
    { priority: 55, maxShows: 2, cooldownSeconds: 90, once: false }
  ),
  point: base(
    'tip.facility.stand',
    'A Tier-1 stand pays the gate fee every match.',
    'neutral',
    'point-right',
    { priority: 55, target: 'stands', maxShows: 2, cooldownSeconds: 120, once: false }
  ),
  blocked: base(
    'step.players.blocked',
    'Sell the luxury, keep the spine. We can rebuild in January.',
    'worried',
    'idle',
    { priority: 92, dismissible: false, maxShows: 0, once: false }
  ),
};
