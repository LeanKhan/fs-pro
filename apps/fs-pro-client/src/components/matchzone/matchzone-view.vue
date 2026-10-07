<template>
  <div class="mz" :class="{ 'mz--overlay': overlay, 'mz--narrow': narrow }">
    <div ref="stageEl" class="mz-stage" />

    <!-- Loading / error -->
    <div v-if="status === 'loading' || status === 'simulating'" class="mz-center">
      <div class="mz-card mz-loading">
        <span class="mz-spin" v-html="icons.ball" />
        <b>{{ status === 'simulating' ? 'Playing the match…' : 'Opening the Matchzone…' }}</b>
      </div>
    </div>
    <div v-else-if="status === 'error'" class="mz-center">
      <div class="mz-card mz-error">
        <span v-html="icons.alert" />
        <b>{{ error }}</b>
        <div class="mz-row">
          <button class="mz-btn" @click="load">Try again</button>
          <button class="mz-btn" @click="close">Back</button>
        </div>
      </div>
    </div>

    <template v-if="data && status !== 'error'">
      <!-- Top: back, scorebug, camera -->
      <button class="mz-round mz-back" aria-label="Leave the Matchzone" @click="close"><span v-html="icons.close" /></button>

      <div class="mz-bug" :class="{ live: playing }">
        <div class="mz-bug__team">
          <img :src="crest(data.home.code)" alt="" @error="crestFallback($event, data.home.name)" />
          <span class="code">{{ data.home.code }}</span>
          <i class="kit" :style="kitStyle(data.home.kit)" />
        </div>
        <div class="mz-bug__score">
          <b :key="'h' + score[0]" class="pop">{{ score[0] }}</b>
          <span>-</span>
          <b :key="'a' + score[1]" class="pop">{{ score[1] }}</b>
        </div>
        <div class="mz-bug__team right">
          <i class="kit" :style="kitStyle(data.away.kit)" />
          <span class="code">{{ data.away.code }}</span>
          <img :src="crest(data.away.code)" alt="" @error="crestFallback($event, data.away.name)" />
        </div>
        <div class="mz-bug__clock">
          <span v-if="playing" class="dot" />
          {{ clockLabel }}
        </div>
        <div class="mz-bug__xg">xG {{ stats.home.xg.toFixed(2) }} · {{ stats.away.xg.toFixed(2) }}</div>
      </div>

      <div v-if="phase === 'live'" class="mz-cams" role="group" aria-label="Camera">
        <button
          v-for="c in cameras"
          :key="c.mode"
          class="mz-cam"
          :class="{ on: camera === c.mode }"
          :aria-pressed="camera === c.mode"
          :title="c.label"
          @click="setCamera(c.mode)"
        >
          <span v-html="c.icon" /><small>{{ c.label }}</small>
        </button>
        <button class="mz-cam" :class="{ on: drawer }" :aria-pressed="drawer" title="Match centre" @click="drawer = !drawer">
          <span v-html="icons.chart" /><small>Stats</small>
        </button>
      </div>

      <!-- Holder tag -->
      <div v-if="tag && phase === 'live'" class="mz-tag" :style="{ transform: `translate(${tag.x}px, ${tag.y}px)` }">
        <i :style="{ background: tag.color }" />{{ tag.name }}
      </div>

      <!-- Banners -->
      <transition name="mz-banner">
        <div v-if="banner" :key="banner.id" class="mz-banner" :class="banner.kind">
          <div v-if="banner.kind === 'goal'" class="mz-banner__goal" :style="{ '--c': banner.color }">GOAL!</div>
          <div v-else-if="banner.kind === 'card'" class="mz-banner__card"><i :class="banner.card" /></div>
          <div class="mz-banner__body">
            <b>{{ banner.title }}</b>
            <span v-if="banner.sub">{{ banner.sub }}</span>
          </div>
          <span v-if="banner.xg != null" class="mz-xg" :style="{ background: xgColor(banner.xg) }">xG {{ banner.xg.toFixed(2) }}</span>
        </div>
      </transition>

      <!-- Commentary ticker -->
      <transition name="mz-tick" mode="out-in">
        <div v-if="ticker && phase === 'live'" :key="ticker.id" class="mz-ticker">
          <span class="min">{{ ticker.minute }}'</span>
          <i class="side" :style="{ background: ticker.color }" />
          <span class="msg">{{ ticker.text }}</span>
        </div>
      </transition>

      <!-- Match centre drawer -->
      <transition name="mz-drawer">
        <aside v-if="drawer" class="mz-drawer" aria-label="Match centre">
          <div class="mz-tabs" role="tablist">
            <button v-for="t in tabs" :key="t" role="tab" :aria-selected="tab === t" :class="{ on: tab === t }" @click="tab = t">{{ t }}</button>
            <button class="mz-x" aria-label="Close match centre" @click="drawer = false"><span v-html="icons.close" /></button>
          </div>
          <div v-if="tab === 'Stats'" class="mz-stats">
            <div class="mz-stats__head">
              <span><i class="kit" :style="kitStyle(data.home.kit)" />{{ data.home.code }}</span>
              <span>{{ data.away.code }}<i class="kit" :style="kitStyle(data.away.kit)" /></span>
            </div>
            <div v-for="row in statRows" :key="row.label" class="mz-stat">
              <div class="mz-stat__nums">
                <b>{{ row.fmt(row.h) }}</b><span>{{ row.label }}</span><b>{{ row.fmt(row.a) }}</b>
              </div>
              <div class="mz-stat__bar">
                <span><i :style="{ width: lead(row.h, row.a) + '%', background: data.home.kit[0] }" /></span>
                <span><i :style="{ width: lead(row.a, row.h) + '%', background: data.away.kit[0] }" /></span>
              </div>
            </div>
            <p class="mz-note">Shot quality (xG) comes straight from the engine: every chance is priced by distance, angle, pressure and the shooter.</p>
          </div>
          <div v-else-if="tab === 'Lineups'" class="mz-lineups">
            <div v-for="side in (['home', 'away'] as const)" :key="side" class="mz-lineup">
              <h4><i class="kit" :style="kitStyle(data[side].kit)" />{{ data[side].name }}</h4>
              <ul>
                <li v-for="p in lineup[side]" :key="p.id" :class="{ off: p.sentOff }">
                  <span class="num" :style="{ background: data[side].kit[0], color: textOn(data[side].kit[0]) }">{{ p.num }}</span>
                  <span class="pos">{{ p.pos }}</span>
                  <span class="name">{{ names[p.id] ?? '—' }}</span>
                  <span class="marks">
                    <i v-for="g in goalsBy(p.id)" :key="'g' + g" v-html="icons.ball" />
                    <i v-for="c in cardsBy(p.id)" :key="'c' + c.minute" class="card" :class="c.kind" />
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <ol v-else class="mz-feed">
            <li v-for="f in feedSoFar" :key="f.id" :class="f.kind">
              <span class="min">{{ f.minute }}'</span>
              <i class="side" :style="{ background: f.color }" />
              <span>{{ f.text }}</span>
            </li>
            <li v-if="!feedSoFar.length" class="empty">Kick-off is coming up…</li>
          </ol>
        </aside>
      </transition>

      <!-- Controls dock -->
      <div v-if="phase === 'live'" class="mz-dock">
        <div class="mz-dock__controls">
          <button class="mz-ctl" aria-label="Previous key moment" @click="jump(-1)"><span v-html="icons.prev" /></button>
          <button class="mz-ctl big" :aria-label="playing ? 'Pause' : 'Play'" @click="togglePlay"><span v-html="playing ? icons.pause : icons.play" /></button>
          <button class="mz-ctl" aria-label="Next key moment" @click="jump(1)"><span v-html="icons.next" /></button>
          <button class="mz-speed" :aria-label="`Speed ${speed}x`" @click="cycleSpeed">{{ speed }}×</button>
        </div>
        <mz-momentum
          class="mz-dock__timeline"
          :minute="timelineMinute"
          :momentum="momentum"
          :events="events"
          :home-color="data.home.kit[0]"
          :away-color="data.away.kit[0]"
          :names="names"
          @seek="seekMinute"
        />
        <button class="mz-skip" @click="skipToEnd">Result <span v-html="icons.next" /></button>
      </div>

      <!-- Pre-match -->
      <div v-if="phase === 'pre'" class="mz-center mz-center--low">
        <div class="mz-card mz-pre">
          <small class="mz-eyebrow">{{ data.competition || 'Matchday' }}</small>
          <div class="mz-vs">
            <div class="club">
              <img :src="crest(data.home.code)" alt="" @error="crestFallback($event, data.home.name)" />
              <b>{{ data.home.name }}</b>
              <i class="kit wide" :style="kitStyle(data.home.kit)" />
            </div>
            <span class="vs">VS</span>
            <div class="club">
              <img :src="crest(data.away.code)" alt="" @error="crestFallback($event, data.away.name)" />
              <b>{{ data.away.name }}</b>
              <i class="kit wide" :style="kitStyle(data.away.kit)" />
            </div>
          </div>
          <label v-if="needsSimulation && canSimulateRest" class="mz-check">
            <input v-model="simulateRest" type="checkbox" /> Also play the rest of today's fixtures
          </label>
          <div class="mz-row">
            <button class="mz-btn primary" @click="kickOff"><span v-html="icons.whistle" /> Kick off</button>
            <button class="mz-btn" @click="skipToEnd">Skip to result</button>
          </div>
        </div>
      </div>

      <!-- Full time -->
      <div v-if="phase === 'full'" class="mz-center mz-center--low">
        <div class="mz-card mz-ft" :class="resultClass">
          <small class="mz-eyebrow">Full time</small>
          <div class="mz-ft__score">
            <div class="club">
              <img :src="crest(data.home.code)" alt="" @error="crestFallback($event, data.home.name)" />
              <span>{{ data.home.name }}</span>
            </div>
            <b>{{ score[0] }} - {{ score[1] }}</b>
            <div class="club">
              <img :src="crest(data.away.code)" alt="" @error="crestFallback($event, data.away.name)" />
              <span>{{ data.away.name }}</span>
            </div>
          </div>
          <div class="mz-ft__scorers">
            <ul>
              <li v-for="g in scorers.home" :key="g.key"><i v-html="icons.ball" />{{ g.name }} {{ g.minute }}'<em v-if="g.pen"> (pen)</em></li>
            </ul>
            <ul class="right">
              <li v-for="g in scorers.away" :key="g.key">{{ g.name }} {{ g.minute }}'<em v-if="g.pen"> (pen)</em><i v-html="icons.ball" /></li>
            </ul>
          </div>
          <div class="mz-ft__chips">
            <span class="chip">xG {{ stats.home.xg.toFixed(2) }} - {{ stats.away.xg.toFixed(2) }}</span>
            <span v-if="possession" class="chip">Possession {{ possession[0] }}% - {{ possession[1] }}%</span>
            <span class="chip">Shots {{ stats.home.shots }} - {{ stats.away.shots }}</span>
            <span v-if="motm" class="chip gold"><span v-html="icons.star" /> {{ motm }}</span>
          </div>
          <div class="mz-row">
            <button class="mz-btn" @click="watchAgain"><span v-html="icons.rotate" /> Watch again</button>
            <button class="mz-btn" @click="openStats">Match centre</button>
            <button class="mz-btn primary" @click="close">{{ overlay ? 'Collect rewards' : 'Done' }}</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { sfx } from '@/services/sfx';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { unpackFrames, type MatchFrame } from '@repo/api-contract';
import { client } from '@/services/api';
import { crestUrl } from '@/helpers/crest';
import { clubColors, crestFallback } from '@/components/cozy/club-colors';
import { icon } from '@/components/cozy/icons';
import MzMomentum from './hud/mz-momentum.vue';
import { Playback, isShot, type Moment, type SideStats, type TimelineEvent, type Side } from './playback';
import { MatchStage, type CameraMode } from './stage/match-stage';
import { xgColor } from './stage/effects';

interface Club {
  id: string;
  name: string;
  code: string;
  kit: [string, string];
}
interface MatchData {
  home: Club;
  away: Club;
  details: any;
  frames: MatchFrame[];
  names: Record<string, string>;
  competition?: string;
}

const props = defineProps<{
  /** The fixture to show. Unplayed fixtures are played on Kick off. */
  fixtureId?: string;
  /** Dev: the bundled demo match instead of the API. */
  demo?: boolean;
  /** Opened over the campus: closing returns there. */
  overlay?: boolean;
  /** Skip the pre-match panel and start playing. */
  autoplay?: boolean;
  /** Admins may play the rest of the day's fixtures with this one. */
  canSimulateRest?: boolean;
  /** Watching live: real ms since kick-off. Joins at that point, at 1x. */
  liveFromMs?: number | null;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'played'): void }>();

const svg = (body: string) => `<svg viewBox="0 0 32 32" class="ic" aria-hidden="true">${body}</svg>`;
const icons = {
  ball: icon('ball'),
  alert: icon('alert'),
  close: icon('close'),
  star: icon('star'),
  rotate: icon('rotate'),
  play: svg('<path d="M11 7l15 9-15 9z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  pause: svg('<rect x="8" y="7" width="6" height="18" rx="2" fill="currentColor"/><rect x="18" y="7" width="6" height="18" rx="2" fill="currentColor"/>'),
  prev: svg('<path d="M24 8L13 16l11 8zM9 8v16" stroke="currentColor" stroke-width="3" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"/>'),
  next: svg('<path d="M8 8l11 8-11 8zM23 8v16" stroke="currentColor" stroke-width="3" fill="currentColor" stroke-linejoin="round" stroke-linecap="round"/>'),
  whistle: svg('<circle cx="12" cy="19" r="7" fill="#f5b82e" stroke="#8a5a3b" stroke-width="2"/><path d="M14 12h13v6h-8" fill="#f5b82e" stroke="#8a5a3b" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="19" r="2.5" fill="#8a5a3b"/>'),
  chart: svg('<rect x="5" y="16" width="5" height="10" rx="1.5" fill="#5cc23a"/><rect x="13.5" y="9" width="5" height="17" rx="1.5" fill="#3a8ee0"/><rect x="22" y="5" width="5" height="21" rx="1.5" fill="#f5b82e"/>'),
  tv: svg('<rect x="4" y="7" width="24" height="16" rx="3" fill="#7cc7f5" stroke="#2f75c9" stroke-width="2.2"/><path d="M11 27h10M16 23v4" stroke="#2f75c9" stroke-width="2.4" stroke-linecap="round"/><path d="M8 19l5-5 4 3 6-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  board: svg('<rect x="4" y="6" width="24" height="20" rx="3" fill="#5cc23a" stroke="#2f8a1c" stroke-width="2.2"/><path d="M16 6v20" stroke="#fff" stroke-width="1.8"/><circle cx="16" cy="16" r="3.5" stroke="#fff" stroke-width="1.8" fill="none"/><circle cx="9" cy="12" r="1.8" fill="#e5402f"/><circle cx="10" cy="20" r="1.8" fill="#e5402f"/><circle cx="22" cy="14" r="1.8" fill="#2f75c9"/><path d="M9 12l12 2" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 2"/>'),
  follow: svg('<circle cx="16" cy="16" r="11" fill="#fff6dd" stroke="#e5402f" stroke-width="2.2"/><circle cx="16" cy="16" r="5.5" fill="none" stroke="#e5402f" stroke-width="2.2"/><circle cx="16" cy="16" r="2" fill="#e5402f"/>'),
};
const cameras: { mode: CameraMode; label: string; icon: string }[] = [
  { mode: 'broadcast', label: 'TV', icon: icons.tv },
  { mode: 'tactical', label: 'Tactics', icon: icons.board },
  { mode: 'follow', label: 'Follow', icon: icons.follow },
];
const tabs = ['Stats', 'Lineups', 'Feed'] as const;

const stageEl = ref<HTMLElement | null>(null);
const status = ref<'loading' | 'simulating' | 'ready' | 'error'>('loading');
const error = ref('');
const data = shallowRef<MatchData | null>(null);
const needsSimulation = ref(false);
const simulateRest = ref(false);
const phase = ref<'pre' | 'live' | 'full'>('pre');
const playing = ref(false);
// Remembered per device; 2x keeps a match to a CoC-sized couple of minutes.
const SPEED_KEY = 'fspro_match_speed';
const speed = ref(readSpeed());
function readSpeed() {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return [1, 2, 4, 8].includes(v) ? v : 2;
  } catch {
    return 2;
  }
}
const camera = ref<CameraMode>('intro');
const drawer = ref(false);
const tab = ref<(typeof tabs)[number]>('Stats');
const narrow = ref(false);
const moment = shallowRef<Moment | null>(null);
const banner = ref<null | { id: number; kind: 'goal' | 'card' | 'chance' | 'info'; title: string; sub?: string; xg?: number; color?: string; card?: string }>(null);
const ticker = ref<null | { id: number; minute: number; text: string; color: string }>(null);
const tag = ref<null | { x: number; y: number; name: string; color: string }>(null);

let stage: MatchStage | null = null;
let playback: Playback | null = null;
let bannerTimer = 0;
let tickerTimer = 0;
let seq = 0;

const names = computed(() => data.value?.names ?? {});
const events = computed<TimelineEvent[]>(() => (data.value && playback ? playback.events : []));
const momentum = computed(() => (data.value && playback ? playback.xgMomentum(5) : { home: [], away: [] }));
const score = computed<[number, number]>(() => moment.value?.score ?? [0, 0]);
const stats = computed<{ home: SideStats; away: SideStats }>(() =>
  playback && moment.value ? playback.statsAt(moment.value.t) : { home: blankStats(), away: blankStats() }
);
const timelineMinute = computed(() => {
  const m = moment.value;
  if (!m || !playback) return 0;
  return playback.finished ? 90 : Math.max(0, m.minute - 1 + (m.t % 1));
});
const clockLabel = computed(() => {
  const m = moment.value;
  if (!m) return '';
  if (phase.value === 'full' || playback?.finished) return 'Full time';
  if (phase.value === 'pre') return 'Kick-off';
  return `${m.minute}' · ${m.half === 1 ? '1st' : '2nd'} half`;
});
const possession = computed<[number, number] | null>(() => {
  const d = data.value?.details;
  const h = d?.HomeTeamDetails?.Possession;
  const a = d?.AwayTeamDetails?.Possession;
  return typeof h === 'number' && typeof a === 'number' ? [h, a] : null;
});
const motm = computed(() => data.value?.details?.MOTM?.name ?? null);

function blankStats(): SideStats {
  return { goals: 0, shots: 0, onTarget: 0, xg: 0, fouls: 0, yellow: 0, red: 0 };
}

const statRows = computed(() => {
  const s = stats.value;
  const d = data.value?.details;
  const full = phase.value === 'full' || !!playback?.finished;
  const int = (v: number) => String(Math.round(v));
  const rows = [
    { label: 'Goals', h: s.home.goals, a: s.away.goals, fmt: int },
    { label: 'Expected goals', h: s.home.xg, a: s.away.xg, fmt: (v: number) => v.toFixed(2) },
    { label: 'Shots', h: s.home.shots, a: s.away.shots, fmt: int },
    { label: 'On target', h: s.home.onTarget, a: s.away.onTarget, fmt: int },
    { label: 'Fouls', h: s.home.fouls, a: s.away.fouls, fmt: int },
    { label: 'Yellow cards', h: s.home.yellow, a: s.away.yellow, fmt: int },
  ];
  if (full && d?.HomeTeamDetails) {
    const H = d.HomeTeamDetails;
    const A = d.AwayTeamDetails;
    rows.splice(1, 0, { label: 'Possession %', h: H.Possession ?? 0, a: A.Possession ?? 0, fmt: int });
    rows.push({ label: 'Passes', h: H.Passes ?? 0, a: A.Passes ?? 0, fmt: int });
    if (H.Tackles != null) rows.push({ label: 'Tackles', h: H.Tackles, a: A.Tackles, fmt: int });
  }
  return rows;
});
/** A side's bar, relative to the larger of the two (full = leading). */
const lead = (a: number, b: number) => (a <= 0 ? 0 : (a / Math.max(a, b)) * 100);

const lineup = computed(() => {
  const first = data.value?.frames[0]?.players ?? [];
  const order = { GK: 0, DEF: 1, MID: 2, ATT: 3 } as Record<string, number>;
  const now = moment.value?.players ?? [];
  const off = new Set(now.filter((p) => p.sentOff).map((p) => p.id));
  const bySide = (s: Side) =>
    first
      .filter((p) => p.side === s)
      .sort((a, b) => (order[a.pos] ?? 9) - (order[b.pos] ?? 9) || Number(a.num) - Number(b.num))
      .map((p) => ({ id: p.id, num: p.num, pos: p.pos, sentOff: off.has(p.id) }));
  return { home: bySide('home'), away: bySide('away') };
});
const shown = (e: TimelineEvent) => !!moment.value && (isShot(e.kind) ? e.frame - 0.35 : e.frame) <= moment.value.t;
const goalsBy = (id: string) =>
  events.value.filter((e) => (e.kind === 'goal' || e.kind === 'penalty-goal') && e.playerId === id && shown(e)).map((e) => e.minute);
const cardsBy = (id: string) => events.value.filter((e) => (e.kind === 'yellow' || e.kind === 'red') && e.playerId === id && shown(e));

const scorers = computed(() => {
  const out = { home: [] as { key: string; name: string; minute: number; pen: boolean }[], away: [] as { key: string; name: string; minute: number; pen: boolean }[] };
  for (const e of events.value) {
    if (e.kind !== 'goal' && e.kind !== 'penalty-goal') continue;
    if (!shown(e)) continue;
    out[e.side ?? 'home'].push({ key: `${e.frame}`, name: nameOf(e.playerId), minute: e.minute, pen: e.kind === 'penalty-goal' });
  }
  return out;
});
const resultClass = computed(() => {
  const [h, a] = score.value;
  return h > a ? 'home-win' : a > h ? 'away-win' : 'draw';
});

const feed = computed(() =>
  events.value
    .filter((e) => e.kind !== 'foul')
    .map((e, i) => ({ id: i, frame: e.frame, landAt: isShot(e.kind) ? e.frame - 0.35 : e.frame, minute: e.minute, kind: e.kind, text: commentary(e), color: sideColor(e.side) }))
);
const feedSoFar = computed(() => {
  const t = moment.value?.t ?? 0;
  return feed.value.filter((f) => f.landAt <= t).reverse();
});

function nameOf(id?: string) {
  return (id && names.value[id]) || 'Unknown';
}
function sideColor(side: Side | null) {
  if (!data.value || !side) return '#c9a46a';
  return data.value[side].kit[0];
}
function clubOf(side: Side | null) {
  return side && data.value ? data.value[side].name : '';
}
function commentary(e: TimelineEvent): string {
  const who = nameOf(e.playerId);
  switch (e.kind) {
    case 'kickoff':
      return 'Kick-off! We are under way.';
    case 'half':
      return 'Half time.';
    case 'full':
      return 'Full time.';
    case 'goal':
      return `GOAL! ${who} scores for ${clubOf(e.side)}${e.otherId ? `, set up by ${nameOf(e.otherId)}` : ''}.`;
    case 'penalty-goal':
      return `GOAL! ${who} converts the penalty for ${clubOf(e.side)}.`;
    case 'save':
      return `Saved! ${who} denies ${nameOf(e.otherId)}.`;
    case 'miss':
      return (e.xg ?? 0) >= 0.3 ? `Big chance! ${who} should have scored.` : `${who} shoots wide.`;
    case 'block':
      return `${who}'s shot is blocked.`;
    case 'yellow':
      return `Yellow card for ${who}.`;
    case 'red':
      return `Red card! ${who} is sent off.`;
    default:
      return e.message;
  }
}

const crest = (code: string) => crestUrl(code);
const kitStyle = (kit: [string, string]) => ({ background: `linear-gradient(90deg, ${kit[0]} 50%, ${kit[1]} 50%)` });
function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.62 ? '#3b2a1a' : '#ffffff';
}

/** Two kits that look alike: the visitors change to their second colour. */
function resolveKits(home: [string, string], away: [string, string]): [string, string] {
  const dist = (a: string, b: string) => {
    const x = parseInt(a.slice(1), 16);
    const y = parseInt(b.slice(1), 16);
    return Math.abs(((x >> 16) & 255) - ((y >> 16) & 255)) + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) + Math.abs((x & 255) - (y & 255));
  };
  if (dist(home[0], away[0]) > 140) return away;
  if (dist(home[0], away[1]) > 140) return [away[1], away[0]];
  return ['#f5f1e6', away[0]];
}

// ---------------------------------------------------------------------------
async function load() {
  status.value = 'loading';
  error.value = '';
  try {
    const d = props.demo ? await loadDemo() : await loadFixture();
    if (!d) return; // unplayed: the pre-match panel plays it on Kick off
    data.value = d;
    startStage();
  } catch (e) {
    console.error('Matchzone failed to load:', e);
    error.value = e instanceof Error ? e.message : 'Could not open this match.';
    status.value = 'error';
  }
}

async function loadDemo(): Promise<MatchData> {
  // Dev-only fixture: production builds drop the import entirely.
  if (!import.meta.env.DEV) throw new Error('The demo match is only available in development.');
  const raw: any = (await import('@/dev/demo-match.json')).default;
  const names: Record<string, string> = {};
  for (const list of Object.values(raw.Lineups ?? {}) as { id: string; name: string }[][]) {
    for (const p of list) {
      const [first, ...rest] = p.name.split(' ');
      names[p.id] = rest.length ? `${first!.charAt(0)}. ${rest.join(' ')}` : p.name;
    }
  }
  const awayKit = resolveKits(raw.Home.kit, raw.Away.kit);
  return {
    home: { ...raw.Home, kit: raw.Home.kit },
    away: { ...raw.Away, kit: awayKit },
    details: raw.Details,
    frames: unpackFrames(raw.Frames),
    names,
    competition: 'Friendly',
  };
}

async function fetchReplay(fixture: string): Promise<MatchData | null> {
  const res = await client.game.getReplay.query({ params: { fixture } });
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(res.body.message);
  const p = res.body.payload;
  const [homeKit, awayRaw] = await Promise.all([clubColors(p.Home.code), clubColors(p.Away.code)]);
  return {
    home: { ...p.Home, kit: homeKit },
    away: { ...p.Away, kit: resolveKits(homeKit, awayRaw) },
    details: p.Details,
    frames: unpackFrames(p.Frames),
    names: p.Names ?? {},
    competition: p.Details?.LeagueName || 'Friendly',
  };
}

async function loadFixture(): Promise<MatchData | null> {
  if (!props.fixtureId) throw new Error('No match to show.');
  const replay = await fetchReplay(props.fixtureId);
  if (replay) return replay;
  // Not played yet (or played without a replay): show the fixture and
  // play it on Kick off.
  const fx = await client.fixtures.getFixture.query({ params: { id: props.fixtureId } });
  if (fx.status !== 200) throw new Error(fx.body.message);
  const f: any = fx.body.payload;
  if (f.Played) throw new Error('This match was played without a replay, so there is nothing to watch.');
  const homeCode = f.HomeTeam?.ClubCode ?? f.Home;
  const awayCode = f.AwayTeam?.ClubCode ?? f.Away;
  const [homeKit, awayRaw] = await Promise.all([clubColors(homeCode), clubColors(awayCode)]);
  needsSimulation.value = true;
  data.value = {
    home: { id: f.HomeTeam?._id ?? '', name: f.HomeTeam?.Name ?? homeCode, code: homeCode, kit: homeKit },
    away: { id: f.AwayTeam?._id ?? '', name: f.AwayTeam?.Name ?? awayCode, code: awayCode, kit: resolveKits(homeKit, awayRaw) },
    details: null,
    frames: [],
    names: {},
    competition: f.LeagueName || f.Title || 'Matchday',
  };
  status.value = 'ready';
  phase.value = 'pre';
  // An empty ground under the pre-match panel until the match is played.
  startStage([emptyFrame()]);
  return null;
}

function emptyFrame(): MatchFrame {
  return { tick: 0, minute: 0, half: 1, ball: { x: 16, y: 10 }, players: [], events: [] } as unknown as MatchFrame;
}

/** Plays an unplayed fixture on the server, then loads its replay. */
async function simulate() {
  status.value = 'simulating';
  const query: { simulate_rest?: boolean; send_other_results?: boolean } = {};
  if (simulateRest.value) {
    query.simulate_rest = true;
    query.send_other_results = false;
  }
  const res = await client.game.kickoffNew.query({ params: { fixture: props.fixtureId! }, query });
  if (res.status !== 200) throw new Error(res.body.message);
  emit('played');
  needsSimulation.value = false;
  const replay = await fetchReplay(props.fixtureId!);
  if (!replay) throw new Error('The match was played, but its replay was not saved.');
  data.value = replay;
  startStage();
}

function startStage(frames?: MatchFrame[]) {
  const d = data.value;
  const use = frames ?? d?.frames ?? [];
  if (!d || !stageEl.value || !use.length) return;
  stage?.dispose();
  playback = new Playback(use, d.home.code, d.away.code);
  playback.speed = speed.value;
  stage = new MatchStage(stageEl.value, {
    home: { code: d.home.code, name: d.home.name, kit: d.home.kit },
    away: { code: d.away.code, name: d.away.name, kit: d.away.kit },
    playback,
    lowPower: narrow.value || (navigator.hardwareConcurrency ?? 8) <= 4,
  });
  stage.onMoment = (m) => {
    moment.value = m;
    updateTag(m);
    exposeDiagnostics();
    if (playback?.finished && phase.value === 'live') finish();
  };
  stage.onEvents = (evs) => evs.forEach(announce);
  stage.setCamera(phase.value === 'pre' ? 'intro' : camera.value === 'intro' ? 'broadcast' : camera.value);
  stage.start();
  status.value = 'ready';
  if (props.liveFromMs) {
    // Live: the match runs at real pace from kick-off; join where it is now.
    speed.value = 1;
    playback.speed = 1;
    playback.seek(Math.min(playback.lastFrame - 1, props.liveFromMs / 1000 / playback.secondsPerTick));
  }
  moment.value = playback.moment();
  if (props.autoplay || props.liveFromMs) begin();
}

function begin() {
  phase.value = 'live';
  setCamera(camera.value === 'intro' ? 'broadcast' : camera.value);
  if (playback) playback.playing = true;
  playing.value = true;
}

async function kickOff() {
  if (needsSimulation.value) {
    try {
      await simulate();
    } catch (e) {
      console.error('Kick off failed:', e);
      error.value = e instanceof Error ? e.message : 'The match could not be played.';
      status.value = 'error';
      return;
    }
  }
  begin();
}

function finish() {
  phase.value = 'full';
  playing.value = false;
  if (playback) playback.playing = false;
  stage?.setCamera('intro');
}

function togglePlay() {
  if (!playback) return;
  if (playback.finished) {
    watchAgain();
    return;
  }
  playback.playing = !playback.playing;
  playing.value = playback.playing;
}

function cycleSpeed() {
  const steps = [1, 2, 4, 8];
  speed.value = steps[(steps.indexOf(speed.value) + 1) % steps.length]!;
  if (playback) playback.speed = speed.value;
  try {
    localStorage.setItem(SPEED_KEY, String(speed.value));
  } catch {
    // Private mode: the speed lasts this match.
  }
}

function setCamera(mode: CameraMode) {
  camera.value = mode;
  stage?.setCamera(mode);
}

function frameForMinute(minute: number) {
  const frames = data.value?.frames ?? [];
  if (minute >= 90) return frames.length - 1;
  const i = frames.findIndex((f) => f.minute + 1 >= minute);
  return i < 0 ? frames.length - 1 : i;
}

function seekTo(t: number) {
  if (!playback || !stage) return;
  playback.seek(t);
  if (phase.value === 'pre') {
    phase.value = 'live';
    setCamera('broadcast');
  }
  if (phase.value === 'full' && !playback.finished) phase.value = 'live';
  stage.refresh();
}

function seekMinute(minute: number) {
  seekTo(frameForMinute(minute));
}

const keyMoments = computed(() =>
  events.value.filter((e) => e.kind === 'goal' || e.kind === 'penalty-goal' || e.kind === 'red' || e.kind === 'yellow' || (isShot(e.kind) && (e.xg ?? 0) >= 0.2))
);
function jump(dir: 1 | -1) {
  if (!playback) return;
  const t = playback.t;
  const list = keyMoments.value;
  const target = dir > 0 ? list.find((e) => e.frame - 1.4 > t + 0.05) : [...list].reverse().find((e) => e.frame - 1.4 < t - 0.6);
  seekTo(target ? Math.max(0, target.frame - 1.4) : dir > 0 ? playback.lastFrame : 0);
  if (!playback.finished) {
    playback.playing = true;
    playing.value = true;
  }
}

async function skipToEnd() {
  if (needsSimulation.value) {
    try {
      await simulate();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'The match could not be played.';
      status.value = 'error';
      return;
    }
  }
  if (!playback || !stage) return;
  playback.seek(playback.lastFrame);
  stage.refresh();
  finish();
}

function watchAgain() {
  if (!playback || !stage) return;
  playback.seek(0);
  stage.refresh();
  begin();
}

function openStats() {
  drawer.value = true;
  tab.value = 'Stats';
}

function close() {
  emit('close');
}

function announce(e: TimelineEvent) {
  if (e.kind === 'kickoff' || e.kind === 'half' || e.kind === 'full') sfx.play('whistle');
  else if (e.kind === 'goal' || e.kind === 'penalty-goal') sfx.play(e.side === 'away' ? 'concede' : 'goal');
  const color = sideColor(e.side);
  const text = commentary(e);
  if (e.kind !== 'foul') {
    ticker.value = { id: ++seq, minute: e.minute, text, color };
    clearTimeout(tickerTimer);
    tickerTimer = window.setTimeout(() => (ticker.value = null), 4200 / Math.max(1, speed.value * 0.6));
  }
  let b: typeof banner.value = null;
  if (e.kind === 'goal' || e.kind === 'penalty-goal') {
    b = { id: ++seq, kind: 'goal', title: nameOf(e.playerId), sub: e.otherId ? `Assist: ${nameOf(e.otherId)}` : clubOf(e.side), xg: e.xg, color };
  } else if (e.kind === 'yellow' || e.kind === 'red') {
    b = { id: ++seq, kind: 'card', card: e.kind, title: nameOf(e.playerId), sub: e.kind === 'red' ? 'Sent off!' : 'Booked', color };
  } else if (e.kind === 'save' && (e.xg ?? 0) >= 0.15) {
    b = { id: ++seq, kind: 'chance', title: 'What a save!', sub: `${nameOf(e.playerId)} denies ${nameOf(e.otherId)}`, xg: e.xg, color };
  } else if (e.kind === 'miss' && (e.xg ?? 0) >= 0.3) {
    b = { id: ++seq, kind: 'chance', title: 'Big chance!', sub: `${nameOf(e.playerId)} misses`, xg: e.xg, color };
  } else if (e.kind === 'half') {
    b = { id: ++seq, kind: 'info', title: 'Half time', sub: `${score.value[0]} - ${score.value[1]}` };
  }
  if (b) {
    banner.value = b;
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => (banner.value = null), b.kind === 'goal' ? 3600 : 2400);
  }
}

function updateTag(m: Moment) {
  // Who's on the ball (or last touched it, while it travels).
  const holder = m.players.find((p) => p.withBall);
  if (!stage || !holder || m.celebrating || camera.value === 'tactical') {
    tag.value = null;
    return;
  }
  const at = stage.project(holder.id);
  tag.value = at ? { x: at.x, y: at.y - 8, name: nameOf(holder.id), color: sideColor(holder.side) } : null;
}

// --- QA hooks: deterministic states for the canvas inspector -------------------
function exposeDiagnostics() {
  if (!stage) return;
  const d = stage.diagnostics();
  const w = window as any;
  w.__THREE_GAME_DIAGNOSTICS__ = { renderer: d.renderer, fps: d.fps, camera: d.camera, phase: phase.value };
}

const QA_STATES = ['kickoff', 'active-play', 'goal', 'tactical', 'stats', 'full-time'];
function setState(name: string) {
  if (!QA_STATES.includes(name)) throw new Error(`Unknown Matchzone state: ${name}`);
  if (!playback || !stage) throw new Error('The Matchzone is still loading.');
  clearTimeout(bannerTimer);
  banner.value = null;
  drawer.value = false;
  playback.playing = false;
  playing.value = false;
  const firstGoal = events.value.find((e) => e.kind === 'goal' || e.kind === 'penalty-goal');
  const midShot = events.value.find((e) => isShot(e.kind) && e.minute > 20) ?? events.value[0];
  switch (name) {
    case 'kickoff':
      playback.seek(0);
      phase.value = 'pre';
      stage.setCamera('intro');
      stage.refresh();
      break;
    case 'active-play':
    case 'tactical':
    case 'stats': {
      phase.value = 'live';
      setCamera(name === 'tactical' ? 'tactical' : 'broadcast');
      // Mid-move: someone dribbling (same holder across the tick), the shape set.
      const frames = data.value!.frames;
      const start = Math.max(0, (midShot?.frame ?? 100) - 12);
      let f = start;
      for (let i = start; i < frames.length - 1; i++) {
        const a = frames[i]!.players.find((p) => p.withBall)?.id;
        if (a && a === frames[i + 1]!.players.find((p) => p.withBall)?.id) {
          f = i;
          break;
        }
      }
      playback.seek(name === 'tactical' ? Math.max(0, (midShot?.frame ?? 100) - 0.62) : f + 0.5);
      stage.refresh();
      if (name === 'stats') openStats();
      break;
    }
    case 'goal': {
      phase.value = 'live';
      setCamera('broadcast');
      const g = firstGoal!;
      playback.seek(g.frame - 0.3);
      stage.refresh([g], 0.9);
      announce(g);
      clearTimeout(bannerTimer);
      break;
    }
    case 'full-time':
      playback.seek(playback.lastFrame);
      stage.refresh();
      finish();
      break;
  }
  moment.value = playback.moment();
  updateTag(moment.value);
  exposeDiagnostics();
  return { state: name };
}

function onResize() {
  narrow.value = window.innerWidth < 760;
}

onMounted(() => {
  onResize();
  window.addEventListener('resize', onResize);
  if (import.meta.env.DEV) {
    (window as any).__THREE_GAME_TEST_HOOKS__ = {
      setState,
      setPausedForScreenshot: (p: boolean) => stage?.setFrozen(p),
    };
  }
  load();
});

watch(drawer, (open) => {
  if (open && narrow.value) tag.value = null;
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  clearTimeout(bannerTimer);
  clearTimeout(tickerTimer);
  stage?.dispose();
  stage = null;
  const w = window as any;
  if (w.__THREE_GAME_TEST_HOOKS__?.setState === setState) delete w.__THREE_GAME_TEST_HOOKS__;
});

defineExpose({ setState });
</script>

<style lang="scss" src="./matchzone.scss"></style>
