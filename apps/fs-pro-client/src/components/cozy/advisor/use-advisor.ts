/**
 * The advisor store (L8/L9): one source of truth for what Vintra says, used by
 * the campus, the drawers and the founding flow.
 *
 * Content is deterministic and server-authored:
 *   - the step framing line comes from Node `GET /program/:clubId`
 *     (`ProgramState.advisor`, itself the Go engine's evaluation);
 *   - contextual tips come from the Go `POST /program/tip` engine. The client
 *     reaches it through the Node proxy at `POST /program/:clubId/tip` (the
 *     documented seam that Batch 3C wires to `programTip()` in
 *     `services/world/world-service.client.ts`). Until that route exists the
 *     call 404s and the store simply shows the step line — no invented text.
 *
 * Everything else here mirrors the contract selection (§6) so the queue behaves
 * the same whatever the source: priority desc, id asc, then the dismissed /
 * max-shows / cooldown / quiet filters from `advisor-content.ts`.
 *
 * The store is UI-free and injectable (`source`), so the dev lab and Playwright
 * runs drive it with a scripted source and no backend.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { AdvisorLine } from '@repo/api-contract';
import { $axios, client } from '@/services/api';
import {
  emptyMemory,
  mergeLines,
  recordDismiss,
  recordShow,
  selectLine,
  targetBuilding,
  type AdvisorMemory,
} from './advisor-content';

/** Whole minutes since this page loaded: the `tip.idle.break` trigger. */
const loadedAt = typeof performance !== 'undefined' ? performance.timeOrigin : Date.now();
function sessionMinutes(): number {
  return Math.max(0, Math.round((Date.now() - loadedAt) / 60_000));
}

/** How a source yields lines. Implemented by the API and by the lab/tests. */
export interface AdvisorSource {
  /** The step's framing line (arrive / done-N★ / blocked), or null. */
  stepLine(clubId: string): Promise<AdvisorLine | null>;
  /** The one highest-priority eligible contextual tip, or null. */
  tip(clubId: string, memory: AdvisorMemory, now: number): Promise<AdvisorLine | null>;
  /** Persist a dismissal server-side. */
  dismiss(clubId: string, id: string): Promise<void>;
}

/** The live source: Node for the step line and dismissal, the tip seam for tips. */
export class ApiAdvisorSource implements AdvisorSource {
  /** Set once the tip proxy answers 404, so we stop probing it this session. */
  private tipUnavailable = false;

  async stepLine(clubId: string): Promise<AdvisorLine | null> {
    try {
      const res = await client.program.getProgram.query({ params: { clubId } });
      if (res.status === 200 && res.body.success) return res.body.payload.advisor ?? null;
      return null;
    } catch {
      return null;
    }
  }

  async tip(clubId: string, memory: AdvisorMemory, now: number): Promise<AdvisorLine | null> {
    if (this.tipUnavailable) return null;
    try {
      // The Node proxy to Go `POST /program/tip`. Absent today -> caught below.
      const res = await $axios.post(
        `/program/${encodeURIComponent(clubId)}/tip`,
        {
          shows: memory.shows,
          lastShownAt: memory.lastShownAt,
          dismissed: memory.dismissed,
          quiet: memory.quiet,
          now,
          // The one session event the server can't know: how long this visit
          // has lasted (drives `tip.idle.break`). `playBlocked` is derived
          // server-side from the PLAY-gate ledger.
          events: { sessionMinutes: sessionMinutes() },
        },
        // The API is cross-origin in dev (client :8080, API :3010): the
        // session cookie only travels with credentials, like ts-rest's client.
        { withCredentials: true }
      );
      const payload = res.data?.payload ?? res.data;
      return (payload?.tip as AdvisorLine | null) ?? null;
    } catch (err) {
      // No proxy yet (or offline): the step line still guides the owner. A 404
      // means the seam is not wired; don't retry it every campus load.
      if ((err as { response?: { status?: number } })?.response?.status === 404) {
        this.tipUnavailable = true;
      }
      return null;
    }
  }

  async dismiss(clubId: string, id: string): Promise<void> {
    try {
      await client.program.dismissTip.mutation({ params: { clubId, tipId: id }, body: {} });
    } catch {
      /* optimistic: the local memory already hides it */
    }
  }
}

/** A scripted source for the dev lab, screenshots and Playwright. */
export function scriptedSource(lines: {
  step?: AdvisorLine[];
  tips?: AdvisorLine[];
}): AdvisorSource {
  const step = lines.step ?? [];
  const tips = lines.tips ?? [];
  return {
    async stepLine() {
      return step.length ? step[Math.min(step.length - 1, 0)] ?? null : null;
    },
    async tip() {
      return tips.length ? tips[0] ?? null : null;
    },
    async dismiss() {},
  };
}

export type AdvisorPhase = 'hidden' | 'entering' | 'talking' | 'ready' | 'collapsed' | 'exiting';

const memoryKey = (clubId: string) => `fspro_advisor_${clubId}`;

function loadMemory(clubId: string | null): AdvisorMemory {
  if (!clubId) return emptyMemory();
  try {
    const raw = localStorage.getItem(memoryKey(clubId));
    if (!raw) return emptyMemory();
    return { ...emptyMemory(), ...(JSON.parse(raw) as Partial<AdvisorMemory>) };
  } catch {
    return emptyMemory();
  }
}

export const useAdvisorStore = defineStore('advisor', () => {
  const clubId = ref<string | null>(null);
  const enabled = ref(false);
  const phase = ref<AdvisorPhase>('hidden');
  const line = ref<AdvisorLine | null>(null);
  const queue = ref<AdvisorLine[]>([]);
  const memory = ref<AdvisorMemory>(emptyMemory());
  const source = shallowRef<AdvisorSource>(new ApiAdvisorSource());
  /** Auto-clear the 3D marker after this many ms (ADVISOR-SPEC §3). */
  const markerMs = 6000;
  const markerAt = ref(0);

  const visible = computed(() => phase.value !== 'hidden');
  const isTyping = computed(() => phase.value === 'entering' || phase.value === 'talking');
  const collapsed = computed(() => phase.value === 'collapsed');
  const pointBuilding = computed(() => {
    if (!line.value || line.value.pose === 'idle') return null;
    if (!['entering', 'talking', 'ready'].includes(phase.value)) return null;
    return targetBuilding(line.value.target);
  });
  const quiet = computed(() => memory.value.quiet);

  function persist() {
    if (!clubId.value) return;
    try {
      localStorage.setItem(memoryKey(clubId.value), JSON.stringify(memory.value));
    } catch {
      /* private mode */
    }
  }

  /** Bind the store to a club. `own` false means the advisor stays silent. */
  function configure(id: string | null, opts: { own?: boolean; src?: AdvisorSource } = {}) {
    if (id !== clubId.value) {
      clubId.value = id;
      memory.value = loadMemory(id);
    }
    enabled.value = opts.own !== false && !!id;
    if (opts.src) source.value = opts.src;
    if (!enabled.value) hide();
  }

  /** Present one line: enter, then type. Records the show for gates. */
  function present(next: AdvisorLine, rest: AdvisorLine[] = []) {
    line.value = next;
    queue.value = rest;
    memory.value = recordShow(memory.value, next.id, Date.now());
    persist();
    if (next.pose !== 'idle') markerAt.value = Date.now();
    phase.value = 'entering';
  }

  /** Fetch the best line for the club and show it (if anything is eligible). */
  async function load() {
    if (!enabled.value || !clubId.value) return;
    const now = Date.now();
    const [step, tip] = await Promise.all([
      source.value.stepLine(clubId.value),
      source.value.tip(clubId.value, memory.value, now),
    ]);
    const candidates = mergeLines(step ? [step] : [], tip ? [tip] : []);
    const chosen = selectLine(candidates, memory.value, now);
    if (chosen) {
      const rest = candidates.filter((l) => l.id !== chosen.id);
      present(chosen, rest);
      return;
    }
    // Nothing auto-eligible (e.g. the arrive line already shown once): keep the
    // step's framing line reachable on the portrait, so the advisor stays
    // prominent without nagging (ADVISOR-SPEC §5.5).
    const fallback = step ?? tip ?? null;
    line.value = fallback;
    queue.value = [];
    phase.value = fallback ? 'collapsed' : 'hidden';
  }

  /** Typewriter finished (or was skipped). */
  function finishTyping() {
    if (phase.value === 'entering' || phase.value === 'talking') phase.value = 'ready';
  }

  /** Begin the typewriter reveal (the component calls this on mount/next tick). */
  function startTyping() {
    if (phase.value === 'entering') phase.value = 'talking';
  }

  /** Enter / tap: complete the typewriter, else move to the next queued line. */
  async function advance() {
    if (isTyping.value) {
      finishTyping();
      return;
    }
    const next = queue.value.shift();
    if (next) {
      present(next, queue.value);
      return;
    }
    // Nothing queued: collapse to the portrait; the step line can be re-opened.
    phase.value = 'collapsed';
  }

  function expand() {
    // Re-show (and re-type) the framing line the owner asked for again.
    if (phase.value === 'collapsed') phase.value = line.value ? 'entering' : 'hidden';
  }

  function collapse() {
    if (visible.value) phase.value = 'collapsed';
  }

  function hide() {
    phase.value = 'hidden';
    line.value = null;
    queue.value = [];
  }

  /** Esc / the close button: dismiss a dismissible tip; never the program. */
  async function dismissCurrent() {
    const current = line.value;
    if (!current) {
      hide();
      return;
    }
    if (!current.dismissible) {
      // Program step / blocked lines stay reachable: collapse, don't discard.
      phase.value = 'collapsed';
      return;
    }
    memory.value = recordDismiss(memory.value, current.id, Date.now());
    persist();
    if (clubId.value) await source.value.dismiss(clubId.value, current.id);
    phase.value = 'exiting';
    window.setTimeout(() => {
      line.value = null;
      phase.value = 'hidden';
    }, 180);
  }

  function setQuiet(on: boolean) {
    memory.value = { ...memory.value, quiet: on };
    persist();
  }

  function toggleQuiet() {
    setQuiet(!quiet.value);
  }

  /** Programmatic push (founding flow, drawers): show a line immediately. */
  function push(l: AdvisorLine) {
    present(l);
  }

  /** True while the 3D marker for the current line should be drawn. */
  function markerLive(now: number): boolean {
    return !!pointBuilding.value && now - markerAt.value < markerMs;
  }

  return {
    clubId,
    enabled,
    phase,
    line,
    queue,
    memory,
    source,
    visible,
    isTyping,
    collapsed,
    pointBuilding,
    quiet,
    configure,
    load,
    startTyping,
    finishTyping,
    advance,
    expand,
    collapse,
    hide,
    dismissCurrent,
    setQuiet,
    toggleQuiet,
    push,
    markerLive,
  };
});
