/**
 * Dev-only lab for the advisor component (open /advisor-lab.html on the dev
 * server). It mounts the *real* `CozyAdvisor` over a faithful reproduction of
 * the cozy HUD/dock/PLAY geometry — using the app's own `cozy.scss` classes —
 * so the no-overlap rule and every expression/state can be captured with
 * Playwright. Content comes from a scripted source, so no backend is needed.
 *
 * QA hooks: `window.__ADVISOR_TEST_HOOKS__`.
 */
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { AdvisorLine } from '@repo/api-contract';
import '@/components/cozy/cozy.scss';
import CozyAdvisor from '@/components/cozy/advisor/CozyAdvisor.vue';
import { DEMO_LINES } from '@/components/cozy/advisor/advisor-content';
import { useAdvisorStore } from '@/components/cozy/advisor/use-advisor';

const params = new URLSearchParams(location.search);
// Fresh context each run: don't let a previous lab session suppress lines.
try {
  localStorage.removeItem('fspro_advisor_demo-club');
} catch {
  /* private mode */
}
const order: Record<string, string> = {
  neutral: 'neutral',
  happy: 'happy',
  excited: 'excited',
  worried: 'worried',
  thinking: 'thinking',
  point: 'point',
  blocked: 'blocked',
};

const initial = order[params.get('state') ?? ''] ?? 'neutral';
const inline = params.get('inline') === '1';
const currentLine = ref<AdvisorLine>(DEMO_LINES[initial]!);
const quiet = ref(params.get('quiet') === '1');
const marker = ref<{ x: number; y: number; visible: boolean } | null>(null);

function pointMarker(line: AdvisorLine) {
  if (!line.target) return null;
  // A stand-in for the campus's projected building anchor.
  return { x: window.innerWidth * 0.66, y: window.innerHeight * 0.42, visible: true };
}
marker.value = pointMarker(currentLine.value);

const source = {
  async stepLine() {
    return currentLine.value;
  },
  async tip() {
    return null;
  },
  async dismiss() {},
};

const pinia = createPinia();
setActivePinia(pinia);

const Lab = defineComponent({
  setup() {
    const advisor = () =>
      h(CozyAdvisor, {
        clubId: 'demo-club',
        source,
        marker: marker.value,
        own: true,
        autoload: true,
        mode: inline ? 'inline' : 'campus',
        'onUpdate:quiet': (on: boolean) => {
          quiet.value = on;
        },
      });

    if (inline) {
      // The same component inside a drawer/modal (founding, manager hub).
      return () =>
        h('div', { class: 'cozy' }, [
          h('div', { class: 'modal-root open' }, [
            h('div', { class: 'backdrop' }),
            h('div', { class: 'modal' }, [
              h('h2', { style: 'margin:0 0 4px' }, 'Sign your first manager'),
              h('p', { class: 'sub', style: 'margin:0 0 8px' }, 'He carries out your brief on the training pitch.'),
              advisor(),
            ]),
          ]),
        ]);
    }

    return () =>
      h('div', { class: 'cozy' }, [
        h('div', { class: ['lab-hill'] }),
        h('div', { class: ['lab-pitch'] }),
        // Profile + level badge (top-left).
        h('div', { class: 'profile' }, [
          h('div', { class: 'avatar' }, h('span', { style: 'font-size:34px' }, '🧑')),
          h('div', { class: 'lvl-badge' }, '1'),
          h('div', { class: 'xpbar' }, [h('div', { style: 'width:40%' }), h('span', {}, '40 / 100')]),
        ]),
        // Resource HUD (top).
        h('div', { class: 'resbar', 'data-testid': 'hud' }, [
          res('coins', 'V3.2M'),
          res('people', '1,204'),
          res('trophy', 'Level 1'),
        ]),
        // Date bar.
        h('div', { class: 'datebar' }, [h('span', { class: 'chip today' }, 'Matchday')]),
        // Community pill.
        h('div', { class: 'presence', 'data-testid': 'presence' }, [h('i'), '12 online']),
        // Dock (bottom-centre) and PLAY (bottom-right).
        h('div', { class: 'dock', 'data-testid': 'dock' }, [
          dock('ball', 'Team'),
          dock('bag', 'Transfers'),
          dock('hammer', 'Build'),
          dock('trophy', 'League'),
        ]),
        h('div', { class: 'worldbtn' }, 'World'),
        h('div', { class: 'playwrap' }, [
          h('button', { class: 'playbtn', 'data-testid': 'play' }, ['PLAY']),
        ]),
        // Stand-in for the campus's projected building marker.
        marker.value?.visible
          ? h(
              'div',
              {
                class: 'lab-marker',
                style: { transform: `translate(${marker.value.x}px, ${marker.value.y}px)` },
              },
              [
                h('svg', { viewBox: '0 0 48 60', width: 48, height: 60 }, [
                  h('ellipse', { class: 'ring', cx: 24, cy: 46, rx: 15, ry: 6 }),
                  h('path', { class: 'chev', d: 'M24 2 8 18h32z' }),
                  h('path', { class: 'stem', d: 'M24 16v22' }),
                ]),
              ]
            )
          : null,
        // The component under test.
        advisor(),
      ]);
  },
});

const res = (iconName: string, value: string) => {
  const glyphs: Record<string, string> = { coins: '🪙', people: '🧑‍🤝‍🧑', trophy: '🏆' };
  return h('div', { class: 'res' }, [
    h('span', { class: 'ic' }, glyphs[iconName] ?? '•'),
    h('b', {}, value),
  ]);
};
const dock = (iconName: string, label: string) => {
  const glyphs: Record<string, string> = { ball: '⚽', bag: '🎒', hammer: '🔨', trophy: '🏆' };
  return h('button', {}, [h('span', { class: 'ic' }, glyphs[iconName] ?? '•'), h('span', {}, label)]);
};

const app = createApp(Lab);
app.use(pinia);
app.mount('#app');

const store = useAdvisorStore(pinia);

(window as unknown as { __ADVISOR_TEST_HOOKS__: unknown }).__ADVISOR_TEST_HOOKS__ = {
  /** Switch the visible expression/state and push it. */
  async setState(id: string) {
    const line = DEMO_LINES[id] ?? DEMO_LINES.neutral!;
    currentLine.value = line;
    marker.value = pointMarker(line);
    store.push(line);
    if (quiet.value) store.setQuiet(true);
    await nextTick();
    return { state: id, text: line.text, expr: line.expr, pose: line.pose };
  },
  async setMarker(x: number, y: number, visible = true) {
    marker.value = { x, y, visible };
    await nextTick();
  },
  /**
   * QA (Batch 4B): show an arbitrary frozen advisor line, so the text-fit gate
   * can exercise every Go-authored line (not just the demo catalog). No
   * program logic is involved — this only pushes a line into the same store the
   * app uses.
   */
  async pushLine(line: AdvisorLine) {
    currentLine.value = line;
    marker.value = pointMarker(line);
    store.push(line);
    await nextTick();
    return { id: line.id, text: line.text };
  },
  current() {
    return { state: currentLine.value.id, text: currentLine.value.text };
  },
  /** rAF frame rate with the advisor animating (indicative lab measurement). */
  measureFps(ms = 1500) {
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
};
