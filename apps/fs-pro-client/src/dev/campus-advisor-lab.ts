/**
 * Dev-only lab for the REAL 3D campus + the advisor (phase-2 Batch 4B QA).
 *
 * It mounts the app's own `World` (the same class `cozy-campus.vue` uses) with
 * the default campus layout, and the real `CozyAdvisor`, over the app's own
 * `cozy.scss` HUD geometry. No backend: the campus is procedural and the
 * advisor is fed a scripted source. Open `/campus-advisor-lab.html` on the dev
 * server. (Separate from `campus-lab.*`, which covers terrain/Tier states.)
 *
 * QA hooks (`window.__CAMPUS_TEST_HOOKS__` and the entry-point alias
 * `window.__THREE_GAME_TEST_HOOKS__`) let the threejs-qa-release canvas
 * inspector and Playwright drive named states and freeze for a screenshot:
 *   setState(name) -> { state }
 *   setPausedForScreenshot(paused)
 *   measureFps(ms) -> number
 *   stats() -> renderer counts
 */
import { createApp, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { AdvisorLine } from '@repo/api-contract';
import { DEFAULT_PLACEMENT } from '@repo/api-contract';
import '@/components/cozy/cozy.scss';
import CozyAdvisor from '@/components/cozy/advisor/CozyAdvisor.vue';
import { useAdvisorStore } from '@/components/cozy/advisor/use-advisor';
import { targetBuilding } from '@/components/cozy/advisor/advisor-content';
import { World, type CampusView } from '@/components/cozy/scene/world';
import type { CityVariant } from '@/components/cozy/scene/terrain';

// QA: force the JS typewriter to be instant so a captured frame is stable.
// The real CSS media query still runs; `setPausedForScreenshot` stops it via
// the `.qa-still` class.
const nativeMatchMedia = window.matchMedia.bind(window);
window.matchMedia = ((q: string) => {
  if (q.includes('prefers-reduced-motion')) {
    return {
      matches: true,
      media: q,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    } as unknown as MediaQueryList;
  }
  return nativeMatchMedia(q);
}) as typeof window.matchMedia;

const params = new URLSearchParams(location.search);
const variant = ((params.get('variant') as CityVariant | null) ?? 'city') as CityVariant;

const line = (
  id: string,
  text: string,
  expr: AdvisorLine['expr'],
  pose: AdvisorLine['pose'] = 'idle',
  target: string | null = null
): AdvisorLine => ({
  id,
  speaker: 'vintra',
  text,
  expr,
  pose,
  target,
  priority: 80,
  dismissible: true,
  maxShows: 0,
  cooldownSeconds: 0,
  once: false,
});

const STATES: Record<string, AdvisorLine> = {
  'campus-advisor': line(
    'step.manager.arrive',
    'Right then. Every club needs one voice on the training pitch. Spend on a manager first — the rest waits on him.',
    'neutral'
  ),
  'campus-advisor-point': line(
    'step.facilities.nudge',
    'A Tier-1 stand pays the gate fee every match.',
    'neutral',
    'point-right',
    'stands'
  ),
  'campus-advisor-excited': line(
    'step.manager.done.3',
    "That's a manager who carries out a brief. Now build him a team.",
    'excited',
    'point-right',
    'office'
  ),
};

const currentLine = ref<AdvisorLine>(STATES['campus-advisor']!);

const source = {
  async stepLine() {
    return currentLine.value;
  },
  async tip() {
    return null;
  },
  async dismiss() {},
};

const view: CampusView = {
  tiers: {
    stadium_grounds: { tier: 2, upgrading: false },
    stands: { tier: 1, upgrading: false },
    training_ground: { tier: 1, upgrading: false },
    medical_centre: { tier: 1, upgrading: false },
    youth_academy: { tier: 1, upgrading: false },
    scouting: { tier: 0, upgrading: false },
    staff_house: { tier: 1, upgrading: false },
    office: { tier: 2, upgrading: false },
    dugout: { tier: 1, upgrading: false },
  },
  placement: DEFAULT_PLACEMENT,
  players: [],
  fans: 1400,
  matchDay: false,
  clubLevel: 2,
  colors: ['#5cc23a', '#3a8ee0'],
};

const pinia = createPinia();
setActivePinia(pinia);
const store = useAdvisorStore(pinia);

/** The mounted World, for the QA hooks (fps/pause/stats). */
let activeWorld: World | null = null;
let current = 'campus-advisor';

const Lab = defineComponent({
  setup() {
    const stageEl = ref<HTMLElement | null>(null);
    const world = shallowRef<World | null>(null);
    const marker = ref<{ x: number; y: number; visible: boolean } | null>(null);
    let raf = 0;

    function updateMarker() {
      const w = world.value;
      const b = targetBuilding(currentLine.value.target);
      const at = w && b ? w.anchor(b) : null;
      const p = at && w ? w.project(at) : null;
      marker.value = p && p.visible ? { x: p.x, y: p.y, visible: true } : null;
    }

    onMounted(() => {
      const w = new World(stageEl.value!, variant);
      world.value = w;
      activeWorld = w;
      w.sync(view);
      w.zoom(46);
      const loop = () => {
        raf = requestAnimationFrame(loop);
        w.render();
        updateMarker();
        (window as unknown as { __THREE_GAME_DIAGNOSTICS__: unknown }).__THREE_GAME_DIAGNOSTICS__ = {
          state: current,
          renderer: { ...w.stats },
        };
      };
      raf = requestAnimationFrame(loop);
    });

    onBeforeUnmount(() => {
      cancelAnimationFrame(raf);
      world.value?.dispose();
    });

    return () =>
      h('div', { class: 'cozy' }, [
        h('div', { ref: stageEl, class: 'stage' }),
        h('div', { class: 'profile' }, [
          h('div', { class: 'avatar' }, h('span', { style: 'font-size:34px' }, '🧑')),
          h('div', { class: 'lvl-badge' }, '2'),
          h('div', { class: 'xpbar' }, [h('div', { style: 'width:40%' }), h('span', {}, '40 / 100')]),
        ]),
        h('div', { class: 'resbar', 'data-testid': 'hud' }, [res('coins', 'V3.2M'), res('people', '1,204'), res('trophy', 'Level 2')]),
        h('div', { class: 'datebar' }, [h('span', { class: 'chip today' }, 'Matchday')]),
        h('div', { class: 'presence', 'data-testid': 'presence' }, [h('i'), '12 online']),
        h('div', { class: 'dock', 'data-testid': 'dock' }, [dock('ball', 'Team'), dock('bag', 'Transfers'), dock('hammer', 'Build'), dock('trophy', 'League')]),
        h('div', { class: 'worldbtn' }, 'World'),
        h('div', { class: 'playwrap' }, [h('button', { class: 'playbtn', 'data-testid': 'play' }, ['PLAY'])]),
        h(CozyAdvisor, {
          clubId: 'campus-lab',
          source,
          marker: marker.value,
          own: true,
          autoload: true,
          mode: 'campus',
        }),
      ]);
  },
});

const res = (iconName: string, value: string) => {
  const glyphs: Record<string, string> = { coins: '🪙', people: '🧑‍🤝‍🧑', trophy: '🏆' };
  return h('div', { class: 'res' }, [h('span', { class: 'ic' }, glyphs[iconName] ?? '•'), h('b', {}, value)]);
};
const dock = (iconName: string, label: string) => {
  const glyphs: Record<string, string> = { ball: '⚽', bag: '🎒', hammer: '🔨', trophy: '🏆' };
  return h('button', {}, [h('span', { class: 'ic' }, glyphs[iconName] ?? '•'), h('span', {}, label)]);
};

const app = createApp(Lab);
app.use(pinia);
app.mount('#app');

const HOOKS = {
  async setState(name: string) {
    const l = STATES[name];
    if (!l) throw new Error(`unknown campus-advisor-lab state: ${name}`);
    currentLine.value = l;
    current = name;
    store.push(l);
    await nextTick();
    return { state: name };
  },
  async setPausedForScreenshot(paused: boolean) {
    document.documentElement.classList.toggle('qa-still', paused);
    // Freeze people/traffic/smoke; rendering continues.
    if (activeWorld) activeWorld.paused = paused;
    await nextTick();
    return { paused };
  },
  measureFps(ms = 2000) {
    return new Promise<number>((resolve) => {
      let frames = 0;
      const start = performance.now();
      const tick = () => {
        frames += 1;
        const elapsed = performance.now() - start;
        if (elapsed >= ms) resolve(Math.round((frames * 1000) / elapsed));
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  },
  stats() {
    return activeWorld?.stats ?? null;
  },
};

const w = window as unknown as { __CAMPUS_TEST_HOOKS__: unknown; __THREE_GAME_TEST_HOOKS__: unknown };
w.__CAMPUS_TEST_HOOKS__ = HOOKS;
// The threejs-qa-release canvas inspector reads this name.
w.__THREE_GAME_TEST_HOOKS__ = HOOKS;
