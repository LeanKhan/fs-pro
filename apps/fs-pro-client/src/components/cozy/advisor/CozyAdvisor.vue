<!--
  CozyAdvisor — the one advisor component (L9/L10, ADVISOR-SPEC).

  Used by the campus (docked bottom-left, mode="campus", the default), by the
  drawers and by the founding flow (mode="inline"). It owns no game state: it
  reads the advisor store and dispatches plain intents (advance, dismiss,
  quiet), so the same component works over the 3D campus and inside a modal.

  Accessibility (ADVISOR-SPEC §6):
    - the whole line is always in the DOM (an sr-only span) so a screen reader
      never hears a half-typed word; the visible text is a decorative reveal;
    - the line lives in a `role="status" aria-live="polite" aria-atomic` region;
    - the container is focusable: Enter/Space advance, Esc dismisses the tip;
    - every target is >= 44x44; reduced motion cuts the bob/blink/typewriter.
-->
<template>
  <div
    v-if="shown"
    ref="rootEl"
    class="cozy-advisor"
    :class="[
      `phase-${store.phase}`,
      mode === 'inline' ? 'is-inline' : 'is-docked',
      {
        'is-talking': store.isTyping,
        'is-collapsed': store.collapsed,
        'is-pointing': !!activePose && activePose !== 'idle',
        [`expr-${line!.expr}`]: true,
        [`adv-pose-${activePose}`]: true,
        'is-quiet': store.quiet,
      },
    ]"
    role="group"
    aria-label="Club advisor"
    tabindex="0"
    @keydown="onKeydown"
  >
    <!-- Portrait: decorative, so expressions/poses never carry meaning alone. -->
    <div
      ref="portraitEl"
      class="adv-portrait"
      aria-hidden="true"
      data-testid="advisor-portrait"
      :title="store.collapsed ? 'Show the advisor' : undefined"
      @click.stop="store.collapsed ? store.expand() : store.advance()"
      v-html="portraitSvg"
    />

    <div v-if="!store.collapsed" class="adv-bubble">
      <span class="adv-tail" aria-hidden="true" />
      <div class="adv-head">
        <span class="adv-speaker">Vintra</span>
        <span class="adv-role">club secretary</span>
        <button
          v-if="line?.dismissible"
          class="adv-icon-btn adv-close"
          type="button"
          aria-label="Dismiss this tip"
          @click.stop="store.dismissCurrent()"
          v-html="icon('close')"
        />
      </div>

      <p class="adv-line" role="status" aria-live="polite" aria-atomic="true" data-testid="advisor-line">
        <!-- Full text for assistive tech; the visible span is a reveal. -->
        <span class="adv-sr">{{ line?.text }}</span>
        <span class="adv-visible" aria-hidden="true">{{ visibleText }}</span><span
          v-if="store.isTyping"
          class="adv-caret"
          aria-hidden="true"
        />
      </p>

      <div class="adv-actions">
        <button
          class="adv-icon-btn adv-quiet"
          type="button"
          :aria-pressed="store.quiet"
          :aria-label="store.quiet ? 'Turn advisor tips back on' : 'Quiet advisor tips'"
          @click.stop="toggleQuiet()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4a4 4 0 0 0-4 4v3l-1.6 2.4a.7.7 0 0 0 .6 1.1h10a.7.7 0 0 0 .6-1.1L16 11V8a4 4 0 0 0-4-4Z" />
            <path d="M10 17.5a2 2 0 0 0 4 0" />
            <path v-if="store.quiet" class="adv-slash" d="M4 4l16 16" />
          </svg>
        </button>
        <button class="adv-next" type="button" @click.stop="store.advance()">
          {{ advanceLabel }}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>

    <!-- Collapsed: the portrait alone, with a nudge dot to re-open. -->
    <span v-if="store.collapsed" class="adv-nudge" aria-hidden="true">…</span>

    <!-- Dotted sight-line from the pointer hand to the 3D marker. -->
    <svg
      v-if="sightLine"
      class="adv-sightline"
      :viewBox="`0 0 ${viewport.w} ${viewport.h}`"
      aria-hidden="true"
    >
      <line
        :x1="sightLine.x1"
        :y1="sightLine.y1"
        :x2="sightLine.x2"
        :y2="sightLine.y2"
      />
      <circle :cx="sightLine.x2" :cy="sightLine.y2" r="4" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AdvisorExpr, AdvisorLine, AdvisorPose } from '@repo/api-contract';
import { icon } from '../icons';
import { sideForTarget } from './advisor-content';
import { useAdvisorStore, type AdvisorSource } from './use-advisor';

// Inlined so the art's own CSS (bob, blink, talk visemes) runs and reduced
// motion is honoured inside the SVG. `?raw` is typed by vite/client.
import neutralRaw from './advisor-neutral.svg?raw';
import happyRaw from './advisor-happy.svg?raw';
import excitedRaw from './advisor-excited.svg?raw';
import worriedRaw from './advisor-worried.svg?raw';
import thinkingRaw from './advisor-thinking.svg?raw';

const RAW: Record<AdvisorExpr, string> = {
  neutral: neutralRaw,
  happy: happyRaw,
  excited: excitedRaw,
  worried: worriedRaw,
  thinking: thinkingRaw,
};

const props = withDefaults(
  defineProps<{
    /** The club to advise. Omit to bind the store yourself via `push()`. */
    clubId?: string | null;
    /** campus = docked bottom-left; inline = in flow (drawers, founding). */
    mode?: 'campus' | 'inline';
    /** True while a match/drawer/modal owns the screen: the advisor waits. */
    suspended?: boolean;
    /** A projected 3D building anchor (viewport px), for the pointer. */
    marker?: { x: number; y: number; visible: boolean } | null;
    /** Inject a source (dev lab/tests). Default: the API source. */
    source?: AdvisorSource | null;
    /** Own-club gate. False keeps the advisor silent. */
    own?: boolean;
    /** Auto-load the current line on mount. */
    autoload?: boolean;
  }>(),
  { mode: 'campus', suspended: false, marker: null, source: null, own: true, autoload: true, clubId: null }
);

const emit = defineEmits<{
  (e: 'advance', id: string): void;
  (e: 'dismiss', id: string): void;
  (e: 'update:quiet', on: boolean): void;
  (e: 'point', building: string | null): void;
  (e: 'ready'): void;
}>();

const store = useAdvisorStore();
const rootEl = ref<HTMLElement | null>(null);
const portraitEl = ref<HTMLElement | null>(null);
const typed = ref(0);
const viewport = ref({ w: window.innerWidth, h: window.innerHeight });
const hand = ref({ x: 0, y: 0 });
let raf = 0;
let rafStart = 0;
const CPS = 55; // characters per second

const line = computed<AdvisorLine | null>(() => store.line);
const reduced = ref(
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

/** Docked or inline, never while a modal/match is up. */
const shown = computed(() => store.enabled && store.visible && !props.suspended);

/** Which arm: the line's pose, corrected to the side the target is on. */
const activePose = computed<AdvisorPose>(() => {
  const pose = line.value?.pose ?? 'idle';
  if (pose === 'idle') return 'idle';
  if (props.marker?.visible) {
    const dx = props.marker.x - hand.value.x;
    return sideForTarget(dx, pose);
  }
  return pose;
});

const fullText = computed(() => line.value?.text ?? '');
const visibleText = computed(() => (reduced.value ? fullText.value : fullText.value.slice(0, typed.value)));
const advanceLabel = computed(() => {
  if (store.isTyping) return 'Skip';
  return store.queue.length ? 'Next' : 'Got it';
});

/** Rebuild the SVG with the current expression/pose/state, and aim the arm. */
const portraitSvg = computed(() => {
  const expr = line.value?.expr ?? 'neutral';
  const talking = store.isTyping ? 'talking' : 'idle';
  const raw = RAW[expr];
  const cls = `class="adv expr-${expr} adv-state-${talking} adv-pose-${activePose.value}"`;
  const aim = aimDeg.value;
  const css = aim ? `--adv-aim:${aim}deg;` : '';
  return raw
    .replace(/class="adv expr-[^"]*"/, cls)
    .replace('<svg ', `<svg style="${css}" `);
});

const aimDeg = computed(() => {
  if (!props.marker?.visible || activePose.value === 'idle') return 0;
  const dx = props.marker.x - hand.value.x;
  const dy = props.marker.y - hand.value.y;
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.max(-38, Math.min(38, Math.round(deg)));
});

const sightLine = computed(() => {
  if (!props.marker?.visible || activePose.value === 'idle' || !shown.value) return null;
  return { x1: hand.value.x, y1: hand.value.y, x2: props.marker.x, y2: props.marker.y };
});

// --- Typewriter ------------------------------------------------------------------
function stopTyping() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function runTypewriter() {
  stopTyping();
  const full = fullText.value;
  typed.value = 0;
  store.startTyping();
  if (reduced.value || full.length === 0) {
    typed.value = full.length;
    store.finishTyping();
    emit('ready');
    return;
  }
  rafStart = performance.now();
  const tick = (t: number) => {
    const n = Math.min(full.length, Math.floor(((t - rafStart) / 1000) * CPS));
    typed.value = n;
    if (n < full.length) raf = requestAnimationFrame(tick);
    else {
      raf = 0;
      store.finishTyping();
      emit('ready');
    }
  };
  raf = requestAnimationFrame(tick);
}

// --- Hand / marker geometry --------------------------------------------------------
function measure() {
  viewport.value = { w: window.innerWidth, h: window.innerHeight };
  const p = portraitEl.value?.getBoundingClientRect();
  if (!p) return;
  const left = activePose.value === 'point-left';
  hand.value = { x: p.left + p.width * (left ? 0.1 : 0.9), y: p.top + p.height * 0.735 };
}

// --- Lifecycle ---------------------------------------------------------------------
onMounted(async () => {
  store.configure(props.clubId, { own: props.own, src: props.source ?? undefined });
  window.addEventListener('resize', measure);
  await nextTick();
  measure();
  if (props.autoload && props.clubId) await store.load();
});

onBeforeUnmount(() => {
  stopTyping();
  window.removeEventListener('resize', measure);
});

watch(
  () => [store.line?.id, store.phase] as const,
  async ([id, phase]) => {
    if (!id) return;
    await nextTick();
    measure();
    // `present()` and `expand()` both enter `entering`; type then.
    if (phase === 'entering') runTypewriter();
  }
);

// Rebind when the campus switches club (route change).
watch(
  () => props.clubId,
  async (id) => {
    store.configure(id, { own: props.own, src: props.source ?? undefined });
    if (props.autoload && id) {
      await nextTick();
      measure();
      await store.load();
    }
  }
);

watch(activePose, () => measure());
watch(() => props.marker, () => nextTick().then(measure), { deep: true });
watch(
  () => store.quiet,
  (q) => emit('update:quiet', q)
);

// Reduced-motion preference can change mid-session.
const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
mq?.addEventListener?.('change', (e) => {
  reduced.value = e.matches;
  if (e.matches) {
    typed.value = fullText.value.length;
    store.finishTyping();
  }
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (store.collapsed) store.expand();
    else store.advance();
    emit('advance', line.value?.id ?? '');
  } else if (e.key === 'Escape') {
    e.preventDefault();
    store.dismissCurrent();
    emit('dismiss', line.value?.id ?? '');
  }
}

function toggleQuiet() {
  store.toggleQuiet();
}

// Watch the pointing target for the host (campus draws the marker).
watch(
  () => store.pointBuilding,
  (b) => emit('point', b ?? null),
  { immediate: true }
);

defineExpose({
  /** Show a specific line immediately (founding flow / host-driven cues). */
  show(l: AdvisorLine) {
    store.push(l);
  },
  hide() {
    store.hide();
  },
  advance() {
    return store.advance();
  },
});
</script>

<style scoped>
/* --- Dock (campus) --------------------------------------------------------- */
.cozy-advisor {
  position: fixed;
  left: 10px;
  bottom: 166px;
  z-index: 6;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  max-width: calc(100vw - 20px);
  font-family: 'Fredoka', system-ui, sans-serif;
  color: var(--ink, #4a3220);
  outline: none;
}
.cozy-advisor:focus-visible .adv-bubble,
.cozy-advisor:focus-visible .adv-portrait {
  box-shadow: 0 0 0 3px #f5b82e, var(--shadow, 0 4px 0 rgba(70, 40, 15, 0.35));
}
.cozy-advisor.is-inline {
  position: relative;
  left: auto;
  bottom: auto;
  max-width: 100%;
}

/* Portrait stands on a soft ground shadow; not a rounded "avatar card". */
.adv-portrait {
  position: relative;
  z-index: 2;
  flex: none;
  width: 116px;
  height: 130px;
  cursor: pointer;
  filter: drop-shadow(0 7px 6px rgba(70, 40, 15, 0.3));
  transition: transform 0.14s ease-out;
}
.adv-portrait:active {
  transform: translateY(2px);
}
.adv-portrait :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
.cozy-advisor.is-collapsed .adv-portrait {
  width: 92px;
  height: 104px;
}

/* --- Bubble ----------------------------------------------------------------- */
.adv-bubble {
  position: relative;
  z-index: 2;
  width: 340px;
  max-width: calc(100vw - 20px);
  padding: 9px 12px 10px;
  border-radius: 18px;
  background: var(--cream, #fdf4df);
  border: 3px solid #c9a46a;
  box-shadow: var(--shadow, 0 4px 0 rgba(70, 40, 15, 0.35), 0 8px 18px rgba(0, 0, 0, 0.18));
  animation: adv-in 0.22s ease-out both;
  transform-origin: 0 100%;
}
.is-quiet .adv-bubble {
  border-color: #d8c39a;
}
.adv-tail {
  position: absolute;
  left: -12px;
  bottom: 22px;
  width: 0;
  height: 0;
  border: 7px solid transparent;
  border-right-color: #c9a46a;
  border-left: 0;
}
.adv-tail::after {
  content: '';
  position: absolute;
  left: 3px;
  top: -7px;
  border: 7px solid transparent;
  border-right-color: var(--cream, #fdf4df);
  border-left: 0;
}
.adv-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
}
.adv-speaker {
  font-weight: 700;
  font-size: 15px;
  color: var(--wood-d, #5e3b22);
}
.adv-role {
  font-size: 12px;
  font-weight: 500;
  color: #6f5940;
}
.adv-close {
  margin-left: auto;
}
.adv-line {
  margin: 3px 0 8px;
  font-size: 16px;
  line-height: 1.34;
  min-height: 2.7em;
  color: var(--ink, #4a3220);
  user-select: text;
}
.adv-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.adv-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.15em;
  background: var(--wood, #8a5a3b);
  animation: adv-caret 0.7s steps(1) infinite;
}
.adv-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.adv-icon-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: var(--wood-d, #5e3b22);
  background: #fffaf0;
  border: 2px solid #e2cc9c;
}
.adv-icon-btn:hover {
  background: #fff;
}
.adv-icon-btn svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.adv-icon-btn :deep(.ic) {
  width: 20px;
  height: 20px;
}
.adv-next {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 44px;
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 16px;
  color: #fff;
  background: linear-gradient(#7bd655, #3fa526);
  border: 2px solid #2c7d18;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
}
.adv-next svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.adv-next:hover {
  filter: brightness(1.05);
}

/* Collapsed nudge dot. */
.adv-nudge {
  align-self: flex-end;
  margin-left: -14px;
  margin-bottom: 8px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-weight: 700;
  font-size: 22px;
  line-height: 1;
  color: var(--wood-d, #5e3b22);
  background: var(--gold, #f5b82e);
  border: 3px solid #fff3c9;
  box-shadow: var(--shadow, 0 4px 0 rgba(70, 40, 15, 0.35));
  animation: adv-bob 1.6s ease-in-out infinite;
}

/* Dotted sight-line to the projected building. */
.adv-sightline {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1;
  pointer-events: none;
  overflow: visible;
}
.adv-sightline line {
  stroke: var(--gold, #f5b82e);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 2 9;
}
.adv-sightline circle {
  fill: var(--gold, #f5b82e);
  stroke: #b5860f;
  stroke-width: 2;
}

/* Enter / exit (gated by reduced motion). */
@keyframes adv-in {
  from {
    transform: translateY(16px);
    opacity: 0;
  }
}
@keyframes adv-out {
  to {
    transform: translateY(10px);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .cozy-advisor.phase-exiting {
    animation: adv-out 0.18s ease-in both;
  }
}
@keyframes adv-caret {
  50% {
    opacity: 0;
  }
}
@keyframes adv-bob {
  50% {
    transform: translateY(-4px);
  }
}

/* --- Mobile (cozy.scss breakpoint) ----------------------------------------- */
@media (max-width: 760px) {
  .cozy-advisor {
    left: 8px;
    bottom: 136px;
    gap: 6px;
  }
  .adv-portrait {
    width: 84px;
    height: 94px;
  }
  .cozy-advisor.is-collapsed .adv-portrait {
    width: 72px;
    height: 82px;
  }
  .adv-bubble {
    width: min(62vw, 246px);
    padding: 7px 10px 8px;
  }
  .adv-line {
    font-size: 14px;
    min-height: 2.9em;
  }
}

/* Tiny screens: stack the bubble above the portrait. */
@media (max-width: 360px) {
  .cozy-advisor {
    flex-direction: column;
    align-items: flex-start;
    bottom: 132px;
  }
  .adv-portrait {
    order: 2;
  }
  .adv-bubble {
    order: 1;
    width: auto;
    max-width: calc(100vw - 16px);
  }
  .adv-tail {
    left: 18px;
    bottom: -12px;
    transform: rotate(90deg);
  }
}

/* --- Reduced motion --------------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .adv-bubble {
    animation: none;
  }
  .adv-caret,
  .adv-nudge {
    animation: none;
  }
  .adv-portrait {
    transition: none;
  }
}
</style>
