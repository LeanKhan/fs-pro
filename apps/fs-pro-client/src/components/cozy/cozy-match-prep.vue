<template>
  <div class="prep">
    <div v-if="!prep" class="prep-loading">{{ error || 'The staff are pinning up the team sheet…' }}</div>
    <template v-else>
      <!-- Who, where, when -->
      <header class="prep-head">
        <div class="ph-teams">
          <img :src="crestUrl(myCode)" alt="" width="52" height="52" @error="crestFallback($event, myName)" />
          <div class="ph-vs">
            <span class="kind" :class="prep.fixture.kind">{{ KIND_LABEL[prep.fixture.kind] }}</span>
            <b>{{ prep.fixture.home ? 'vs' : '@' }}</b>
          </div>
          <img :src="crestUrl(prep.fixture.opponent.code)" alt="" width="52" height="52" @error="crestFallback($event, prep.fixture.opponent.name)" />
          <div class="ph-name">
            <h3>{{ prep.fixture.opponent.name }}</h3>
            <small>
              {{ prep.fixture.home ? 'At your ground' : 'Away' }} · Day {{ prep.fixture.day }}, {{ hh(prep.fixture.kickoffHour) }}
              <template v-if="prep.fixture.opponent.human"> · a manager's club</template>
            </small>
          </div>
        </div>
        <div class="ph-clock" :class="{ locked: prep.locked }">
          <span v-html="icon('clock')"></span>
          <template v-if="prep.locked">Kicked off: plan locked</template>
          <template v-else-if="kickoffIn !== null">Kick-off in {{ longClock(kickoffIn) }}</template>
          <template v-else>Kick-off day {{ prep.fixture.day }}</template>
        </div>
      </header>

      <div class="prep-grid">
        <!-- The plan -->
        <div class="prep-plan">
          <section>
            <h4><span class="step">1</span> How we play</h4>
            <div class="styles">
              <button
                v-for="s in STYLES"
                :key="s.key"
                class="style-card"
                :class="{ on: plan.style === s.key, counters: matchup(s.key) > 0, countered: matchup(s.key) < 0 }"
                :disabled="prep.locked"
                @click="setStyle(s.key)"
              >
                <span class="sc-ic" v-html="s.icon"></span>
                <b>{{ s.label }}</b>
                <small>{{ s.blurb }}</small>
                <i v-if="matchup(s.key) > 0" class="tag good">Counters them</i>
                <i v-else-if="matchup(s.key) < 0" class="tag bad">They counter it</i>
              </button>
            </div>
            <div class="formations">
              <span class="lbl">Formation</span>
              <button
                v-for="f in FORMATIONS"
                :key="f"
                class="chipbtn"
                :class="{ on: plan.formation === f }"
                :disabled="prep.locked"
                @click="setFormation(f)"
              >{{ fmtFormation(f) }}</button>
            </div>
            <details class="fine">
              <summary>Fine-tune the instructions</summary>
              <div v-for="sl in SLIDERS" :key="sl.key" class="slider">
                <span>{{ sl.label }}</span>
                <small>{{ sl.lo }}</small>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :disabled="prep.locked"
                  :value="sliderValue(sl.key)"
                  @input="setSlider(sl.key, Number(($event.target as HTMLInputElement).value))"
                />
                <small>{{ sl.hi }}</small>
                <button v-if="plan.sliders?.[sl.key] != null" class="reset" title="Back to the style's default" @click="setSlider(sl.key, null)">↺</button>
              </div>
            </details>
          </section>

          <section>
            <h4>
              <span class="step">2</span> Starting XI
              <small class="count" :class="{ short: xi.length !== 11 }">{{ xi.length }}/11</small>
            </h4>
            <div class="xi-tools">
              <button class="btn small" :disabled="prep.locked" @click="bestXI()"><span v-html="icon('star')"></span>Best XI</button>
              <button class="btn small" :disabled="prep.locked || !tiredStarters" @click="restTired()">
                <span v-html="icon('cross')"></span>Rest tired players{{ tiredStarters ? ` (${tiredStarters})` : '' }}
              </button>
            </div>
            <div class="lines">
              <div v-for="line in LINES" :key="line" class="line">
                <div class="line-head">
                  <span class="pos" :class="`p-${line}`">{{ line }}</span>
                  <small :class="{ short: lineCount(line) !== need[line] }">{{ lineCount(line) }}/{{ need[line] }}</small>
                </div>
                <div class="line-players">
                  <button
                    v-for="p in byLine[line]"
                    :key="p.id"
                    class="pl"
                    :class="{ in: xiSet.has(p.id), hurt: p.injured, tired: p.fitness < 75 }"
                    :disabled="prep.locked || (p.injured && !xiSet.has(p.id))"
                    :title="p.injured ? 'Injured' : `${p.name} · ${p.rating} · fitness ${p.fitness}%`"
                    @click="togglePlayer(p.id)"
                  >
                    <span class="pl-name">{{ p.name }}</span>
                    <span class="pl-meta">★{{ p.rating }}</span>
                    <span class="fit"><i :style="{ width: `${p.fitness}%` }"></i></span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h4><span class="step">3</span> Half-time orders</h4>
            <p class="sub">The staff carry these out at the break, whether you're watching or not.</p>
            <div class="ht">
              <label v-for="k in HT_KEYS" :key="k.key" class="ht-row">
                <span>{{ k.label }}</span>
                <select :value="plan.halfTime[k.key] ?? ''" :disabled="prep.locked" @change="setHalfTime(k.key, ($event.target as HTMLSelectElement).value)">
                  <option value="">Keep the plan</option>
                  <option v-for="s in STYLES" :key="s.key" :value="s.key">Switch to {{ s.label }}</option>
                </select>
              </label>
            </div>
          </section>

          <section class="two-col">
            <div>
              <h4><span class="step">4</span> Last training session</h4>
              <div class="opts">
                <button v-for="t in TRAINING" :key="t.key" class="opt" :class="{ on: plan.training === t.key }" :disabled="prep.locked" @click="set('training', t.key)">
                  <b>{{ t.label }}</b><small>{{ t.blurb(prep.facilities.trainingTier) }}</small>
                </button>
              </div>
            </div>
            <div>
              <h4><span class="step">5</span> Team talk</h4>
              <div class="opts">
                <button v-for="t in TALKS" :key="t.key" class="opt" :class="{ on: plan.teamTalk === t.key }" :disabled="prep.locked" @click="set('teamTalk', t.key)">
                  <b>{{ t.label }}</b><small>{{ t.blurb }}</small>
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- Scouting and the assistant's numbers -->
        <aside class="prep-side">
          <div class="pcard scout">
            <h4><span v-html="icon('bolt')"></span> Scouting report</h4>
            <div class="sc-row"><span>Power</span><b>{{ prep.scout.power }}</b><small>you: {{ prep.myPower }}</small></div>
            <div class="sc-row"><span>Formation</span><b>{{ prep.scout.formation ? fmtFormation(prep.scout.formation) : '?' }}</b></div>
            <div class="sc-row"><span>Style</span><b>{{ prep.scout.style ? styleLabel(prep.scout.style) : '?' }}</b></div>
            <div v-if="prep.scout.counter" class="sc-tip">
              Counter with <b>{{ styleLabel(prep.scout.counter) }}</b>
              <button v-if="plan.style !== prep.scout.counter && !prep.locked" class="btn tiny primary" @click="setStyle(prep.scout.counter)">Use it</button>
            </div>
            <div v-if="prep.scout.form.length" class="sc-row">
              <span>Form</span>
              <span class="formrow"><i v-for="(r, i) in prep.scout.form" :key="i" :class="`res-${r.toLowerCase()}`">{{ r }}</i></span>
            </div>
            <ul v-if="prep.scout.keyPlayers.length" class="keys">
              <li v-for="k in prep.scout.keyPlayers" :key="k.name"><span class="pos small">{{ k.position }}</span>{{ k.name }} <small>★{{ k.rating }}</small></li>
            </ul>
            <p v-for="n in prep.scout.notes" :key="n" class="sc-note">{{ n }}</p>
          </div>

          <div class="pcard odds" :class="{ busy: previewing }">
            <h4><span v-html="icon('ball')"></span> The assistant's read</h4>
            <template v-if="preview">
              <div class="oddsbar" :title="`${pct(preview.win)} win · ${pct(preview.draw)} draw · ${pct(preview.loss)} loss`">
                <i class="w" :style="{ width: pct(preview.win) }"><span v-if="preview.win > 0.12">{{ pct(preview.win) }}</span></i>
                <i class="d" :style="{ width: pct(preview.draw) }"><span v-if="preview.draw > 0.12">{{ pct(preview.draw) }}</span></i>
                <i class="l" :style="{ width: pct(preview.loss) }"><span v-if="preview.loss > 0.12">{{ pct(preview.loss) }}</span></i>
              </div>
              <div class="oddslegend"><span>Win</span><span>Draw</span><span>Loss</span></div>
              <p class="xscore">
                Typical score <b>{{ preview.goalsFor.toFixed(1) }} - {{ preview.goalsAgainst.toFixed(1) }}</b>
                <span v-if="delta !== null && Math.round(delta * 100) !== 0" class="delta" :class="delta > 0 ? 'up' : delta < 0 ? 'down' : ''">
                  {{ delta > 0 ? '▲' : delta < 0 ? '▼' : '=' }} {{ Math.abs(Math.round(delta * 100)) }} pts win chance
                </span>
              </p>
              <ul class="factors">
                <li v-for="f in preview.factors" :key="f.label" :class="f.tone"><b>{{ f.label }}</b><span>{{ f.detail }}</span></li>
              </ul>
              <small class="runs">Played out {{ preview.runs }} times by the match engine.</small>
            </template>
            <p v-else class="sub">{{ previewError || 'Running the numbers…' }}</p>
          </div>

          <div v-if="!prep.locked" class="save">
            <label class="def"><input v-model="asDefault" type="checkbox" /> Also make this my standing team sheet</label>
            <button class="btn primary big" :disabled="saving || xi.length !== 11" @click="save">
              <span v-html="icon('check')"></span>{{ saving ? 'Saving…' : dirty ? 'Lock in the plan' : 'Plan locked in' }}
            </button>
            <small v-if="xi.length !== 11" class="short">Pick exactly 11 starters.</small>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { MatchPlan, MatchPrep, PlanPreview, StyleKey } from '@repo/api-contract';
import { client } from '@/services/api';
import { crestUrl } from '@/helpers/crest';
import { sfx } from '@/services/sfx';
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{ clubId: string; fixtureId: string; myName: string; myCode: string; nowMs: number }>();
const emit = defineEmits<{ (e: 'saved', plan: MatchPlan): void; (e: 'toast', text: string, color?: string): void }>();

const KIND_LABEL: Record<string, string> = { league: 'League', booked: 'Booked', challenge: 'Challenge', cup: 'Cup', friendly: 'Friendly' };
const svg = (b: string) => `<svg viewBox="0 0 32 32" class="ic" aria-hidden="true">${b}</svg>`;
const STYLES: { key: StyleKey; label: string; blurb: string; icon: string }[] = [
  { key: 'Balanced', label: 'Balanced', blurb: 'Safe against anything', icon: svg('<circle cx="16" cy="16" r="11" fill="#fff6dd" stroke="#8a5a3b" stroke-width="2.4"/><path d="M8 16h16" stroke="#8a5a3b" stroke-width="2.4"/>') },
  { key: 'HighPress', label: 'High Press', blurb: 'Hunt the ball high. Tires legs.', icon: svg('<path d="M6 22l8-12 4 6 3-4 5 10z" fill="#e5402f" stroke="#7a1d12" stroke-width="2" stroke-linejoin="round"/>') },
  { key: 'Possession', label: 'Possession', blurb: 'Patient passing, pick the lock', icon: svg('<circle cx="9" cy="20" r="4" fill="#3a8ee0"/><circle cx="23" cy="20" r="4" fill="#3a8ee0"/><circle cx="16" cy="9" r="4" fill="#3a8ee0"/><path d="M11 17l3-5M21 17l-3-5M13 20h6" stroke="#2f75c9" stroke-width="2"/>') },
  { key: 'LowBlock', label: 'Low Block', blurb: 'Sit deep, shut the box', icon: svg('<rect x="5" y="18" width="22" height="8" rx="2" fill="#8a5a3b"/><rect x="8" y="11" width="16" height="6" rx="2" fill="#b07a4f"/>') },
  { key: 'Direct', label: 'Direct', blurb: 'Over the top, into space', icon: svg('<path d="M5 24C10 8 22 8 27 12" stroke="#5cc23a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M23 7l5 5-6 2z" fill="#2f8a1c"/>') },
];
const FORMATIONS = ['433', '442', '4231', '352', '343', '532', '4141', '451'] as const;
const SLIDERS = [
  { key: 'pressing', label: 'Pressing', lo: 'Sit off', hi: 'Swarm' },
  { key: 'line', label: 'Defensive line', lo: 'Deep', hi: 'High' },
  { key: 'width', label: 'Width', lo: 'Narrow', hi: 'Wide' },
  { key: 'tempo', label: 'Tempo', lo: 'Patient', hi: 'Fast' },
  { key: 'directness', label: 'Passing', lo: 'Short', hi: 'Long' },
] as const;
type SliderKey = (typeof SLIDERS)[number]['key'];
/** The engine's style presets (crates/sim-core tactics.rs), for the slider starting points. */
const STYLE_SLIDERS: Record<StyleKey, Record<SliderKey, number>> = {
  Balanced: { pressing: 0.5, line: 0.5, width: 0.6, tempo: 0.5, directness: 0.5 },
  HighPress: { pressing: 0.72, line: 0.8, width: 0.55, tempo: 0.7, directness: 0.5 },
  LowBlock: { pressing: 0.4, line: 0.28, width: 0.5, tempo: 0.35, directness: 0.6 },
  Possession: { pressing: 0.5, line: 0.55, width: 0.7, tempo: 0.4, directness: 0.25 },
  Direct: { pressing: 0.65, line: 0.45, width: 0.5, tempo: 0.8, directness: 0.85 },
};
const HT_KEYS = [
  { key: 'losing', label: 'If we are losing' },
  { key: 'drawing', label: 'If it is level' },
  { key: 'winning', label: 'If we are winning' },
] as const;
const TRAINING = [
  { key: 'none', label: 'Light session', blurb: () => 'No change' },
  { key: 'recovery', label: 'Recovery', blurb: () => 'Starters +20 fitness' },
  { key: 'drills', label: 'Tactical drills', blurb: (tier: number) => `Sharper (+${(0.6 + 0.35 * tier).toFixed(1)}), starters -10 fitness` },
] as const;
const TALKS = [
  { key: 'calm', label: 'Keep calm', blurb: 'No risk' },
  { key: 'motivate', label: 'Motivate', blurb: 'Lifts underdogs most' },
  { key: 'demand', label: 'Demand a win', blurb: 'Big lift for a confident favourite, backfires otherwise' },
] as const;
const LINES = ['GK', 'DEF', 'MID', 'ATT'] as const;
type Line = (typeof LINES)[number];

const prep = ref<MatchPrep | null>(null);
const plan = ref<MatchPlan>({} as MatchPlan);
const savedJson = ref('');
const error = ref('');
const asDefault = ref(false);
const saving = ref(false);
const loadedAt = ref(Date.now());

async function load() {
  error.value = '';
  const res = await client.play.getMatchPrep.query({ params: { clubId: props.clubId, fixtureId: props.fixtureId } });
  if (res.status !== 200) {
    error.value = res.body.message;
    return;
  }
  prep.value = res.body.payload;
  loadedAt.value = Date.now();
  plan.value = JSON.parse(JSON.stringify(res.body.payload.plan));
  if (!plan.value.startingXI.length) bestXI(false);
  savedJson.value = res.body.payload.fixture.planSet ? JSON.stringify(plan.value) : '';
  runPreview();
}
watch(() => props.fixtureId, load, { immediate: true });

const dirty = computed(() => JSON.stringify(plan.value) !== savedJson.value);
const kickoffIn = computed(() => {
  const s = prep.value?.fixture.startsInSeconds;
  return s === null || s === undefined ? null : Math.max(0, s - Math.floor((props.nowMs - loadedAt.value) / 1000));
});

// --- Style, formation, sliders ----------------------------------------------------------
const styleLabel = (k: string) => STYLES.find((s) => s.key === k)?.label ?? k;
const fmtFormation = (f: string) => f.split('').join('-');
const hh = (h: number | null) => `${String(h ?? 20).padStart(2, '0')}:00`;
const CYCLE: StyleKey[] = ['HighPress', 'Possession', 'LowBlock', 'Direct'];
function matchup(own: StyleKey): number {
  const opp = prep.value?.scout.style;
  if (!opp) return 0;
  const a = CYCLE.indexOf(own);
  const b = CYCLE.indexOf(opp);
  if (a < 0 || b < 0) return 0;
  return (a + 1) % 4 === b ? 1 : (b + 1) % 4 === a ? -1 : 0;
}
function setStyle(s: StyleKey) {
  plan.value = { ...plan.value, style: s, sliders: {} };
  sfx.play('tap');
}
function setFormation(f: (typeof FORMATIONS)[number]) {
  plan.value = { ...plan.value, formation: f };
  sfx.play('tap');
}
const sliderValue = (k: SliderKey) => plan.value.sliders?.[k] ?? STYLE_SLIDERS[plan.value.style][k];
function setSlider(k: SliderKey, v: number | null) {
  plan.value = { ...plan.value, sliders: { ...plan.value.sliders, [k]: v } };
}
function set<K extends 'training' | 'teamTalk'>(k: K, v: MatchPlan[K]) {
  plan.value = { ...plan.value, [k]: v };
  sfx.play('tap');
}
function setHalfTime(k: 'losing' | 'drawing' | 'winning', v: string) {
  plan.value = { ...plan.value, halfTime: { ...plan.value.halfTime, [k]: (v || null) as StyleKey | null } };
}

// --- The XI ----------------------------------------------------------------------------
const lineOf = (pos: string): Line => (pos === 'GK' ? 'GK' : pos === 'DEF' ? 'DEF' : pos === 'ATT' ? 'ATT' : 'MID');
const need = computed<Record<Line, number>>(() => {
  const d = plan.value.formation?.split('').map(Number) ?? [4, 3, 3];
  return { GK: 1, DEF: d[0] ?? 4, MID: d.slice(1, -1).reduce((a, b) => a + b, 0), ATT: d[d.length - 1] ?? 3 };
});
const byLine = computed(() => {
  const out: Record<Line, MatchPrep['squad']> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of prep.value?.squad ?? []) out[lineOf(p.position)].push(p);
  return out;
});
const xi = computed(() => plan.value.startingXI ?? []);
const xiSet = computed(() => new Set(xi.value));
const lineCount = (l: Line) => byLine.value[l].filter((p) => xiSet.value.has(p.id)).length;
const tiredStarters = computed(() => (prep.value?.squad ?? []).filter((p) => xiSet.value.has(p.id) && p.fitness < 75).length);

/** Fitness weighs in: a 70%-fit star plays like a lesser player. */
const value = (p: MatchPrep['squad'][number]) => p.rating - (100 - p.fitness) * 0.12;
function pickXI(score: (p: MatchPrep['squad'][number]) => number) {
  const squad = (prep.value?.squad ?? []).filter((p) => !p.injured);
  const ids: string[] = [];
  for (const l of LINES) {
    const best = squad.filter((p) => lineOf(p.position) === l).sort((a, b) => score(b) - score(a)).slice(0, need.value[l]);
    ids.push(...best.map((p) => p.id));
  }
  for (const p of [...squad].sort((a, b) => score(b) - score(a))) {
    if (ids.length >= 11) break;
    if (!ids.includes(p.id)) ids.push(p.id);
  }
  const bench = squad.filter((p) => !ids.includes(p.id)).sort((a, b) => score(b) - score(a)).slice(0, 7).map((p) => p.id);
  plan.value = { ...plan.value, startingXI: ids.slice(0, 11), bench };
}
function bestXI(sound = true) {
  pickXI(value);
  if (sound) sfx.play('tap');
}
/** Swap each tired starter for the freshest fit player of the same line. */
function restTired() {
  const squad = prep.value?.squad ?? [];
  const ids = [...xi.value];
  for (const p of squad.filter((x) => ids.includes(x.id) && x.fitness < 75)) {
    const sub = squad
      .filter((x) => !ids.includes(x.id) && !x.injured && lineOf(x.position) === lineOf(p.position) && x.fitness >= 75)
      .sort((a, b) => value(b) - value(a))[0];
    if (sub) ids.splice(ids.indexOf(p.id), 1, sub.id);
  }
  plan.value = { ...plan.value, startingXI: ids, bench: squad.filter((x) => !ids.includes(x.id) && !x.injured).slice(0, 7).map((x) => x.id) };
  sfx.play('tap');
}
function togglePlayer(id: string) {
  const ids = [...xi.value];
  const i = ids.indexOf(id);
  if (i >= 0) ids.splice(i, 1);
  else if (ids.length < 11) ids.push(id);
  else return emit('toast', 'Your XI is full: take someone out first', 'error');
  plan.value = { ...plan.value, startingXI: ids, bench: plan.value.bench.filter((b) => b !== id) };
  sfx.play('tap');
}

// --- The assistant's read: debounced engine runs ------------------------------------------
const preview = ref<PlanPreview | null>(null);
const previewError = ref('');
const previewing = ref(false);
const firstWin = ref<number | null>(null);
const delta = computed(() => (preview.value && firstWin.value !== null ? preview.value.win - firstWin.value : null));
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
async function runPreview() {
  if (!prep.value || xi.value.length !== 11) return;
  const mine = ++seq;
  previewing.value = true;
  try {
    const res = await client.play.previewMatchPlan.mutation({ params: { clubId: props.clubId, fixtureId: props.fixtureId }, body: { plan: plan.value } });
    if (mine !== seq) return;
    if (res.status === 200) {
      preview.value = res.body.payload;
      previewError.value = '';
      if (firstWin.value === null) firstWin.value = res.body.payload.win;
    } else previewError.value = res.body.message;
  } finally {
    if (mine === seq) previewing.value = false;
  }
}
watch(
  plan,
  () => {
    clearTimeout(timer);
    timer = setTimeout(runPreview, 450);
  },
  { deep: true }
);
onBeforeUnmount(() => clearTimeout(timer));
const pct = (x: number) => `${Math.round(x * 100)}%`;

async function save() {
  saving.value = true;
  try {
    const res = await client.play.saveMatchPlan.mutation({
      params: { clubId: props.clubId, fixtureId: props.fixtureId },
      body: { plan: plan.value, asDefault: asDefault.value },
    });
    if (res.status === 200) {
      prep.value = res.body.payload;
      savedJson.value = JSON.stringify(plan.value);
      sfx.play('complete');
      emit('toast', asDefault.value ? 'Plan locked in, and saved as your team sheet' : 'Plan locked in');
      emit('saved', plan.value);
    } else {
      sfx.play('error');
      emit('toast', res.body.message, 'error');
    }
  } finally {
    saving.value = false;
  }
}

function longClock(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}
</script>

<style scoped>
.prep { display: grid; gap: 12px; }
.prep-loading { padding: 40px; text-align: center; color: var(--muted); }
.prep-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px; border-radius: 16px; background: #fffaf0; border: 3px solid #e2cc9c; }
.ph-teams { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ph-vs { display: grid; justify-items: center; gap: 2px; }
.ph-vs b { font-size: 18px; color: var(--muted); }
.ph-name { min-width: 0; }
.ph-name h3 { margin: 0; font-size: 20px; }
.ph-name small { color: var(--muted); }
.kind { padding: 0 8px; border-radius: 8px; font-size: 11px; font-weight: 700; color: #fff; background: var(--blue); text-transform: uppercase; }
.kind.league { background: var(--green-d); } .kind.booked { background: var(--gold); color: var(--wood-d); } .kind.cup { background: var(--red); }
.ph-clock { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px 6px 8px; border-radius: 14px; background: #fff3c9; border: 2px solid var(--gold); font-weight: 700; font-variant-numeric: tabular-nums; }
.ph-clock.locked { background: #eee5d2; border-color: #c9b48a; }
.ph-clock :deep(.ic) { width: 22px; height: 22px; }
.prep-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; align-items: start; }
.prep-plan { display: grid; gap: 12px; }
section { padding: 12px; border-radius: 16px; background: #fffaf0; border: 2px solid #eadbb8; }
h4 { margin: 0 0 8px; display: flex; align-items: center; gap: 8px; font-size: 17px; }
h4 :deep(.ic) { width: 22px; height: 22px; }
.step { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--wood); color: #fff; font-size: 13px; }
.count { margin-left: auto; font-weight: 700; color: var(--green-d); }
.short { color: var(--red) !important; }
.styles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.style-card { position: relative; display: grid; justify-items: center; gap: 2px; padding: 8px 4px 10px; border-radius: 12px; background: #fff; border: 3px solid #eadbb8; text-align: center; }
.style-card :deep(.ic) { width: 34px; height: 34px; }
.style-card b { font-size: 14px; }
.style-card small { font-size: 11px; color: var(--muted); line-height: 1.2; }
.style-card.on { border-color: var(--green); background: #f1fae6; }
.style-card.counters { box-shadow: 0 0 0 2px #bfe3a5 inset; }
.style-card .tag { position: absolute; top: -10px; padding: 0 6px; border-radius: 8px; font-size: 10px; font-style: normal; font-weight: 700; color: #fff; white-space: nowrap; }
.tag.good { background: var(--green-d); } .tag.bad { background: var(--red); }
.formations { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; }
.lbl { font-size: 13px; font-weight: 600; color: var(--muted); margin-right: 2px; }
.chipbtn { padding: 3px 10px; border-radius: 10px; border: 2px solid #e2cc9c; background: #fff; font-weight: 700; font-size: 13px; }
.chipbtn.on { background: var(--green); border-color: var(--green-d); color: #fff; }
.fine { margin-top: 10px; }
.fine summary { cursor: pointer; font-weight: 600; font-size: 14px; color: var(--wood); }
.slider { display: grid; grid-template-columns: 110px 46px 1fr 46px 22px; align-items: center; gap: 6px; margin-top: 6px; font-size: 13px; }
.slider small { color: var(--muted); font-size: 11px; text-align: center; }
.slider input { width: 100%; accent-color: var(--green-d); }
.reset { font-size: 14px; color: var(--muted); }
.xi-tools { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.lines { display: grid; gap: 8px; }
.line { display: grid; grid-template-columns: 52px 1fr; gap: 8px; align-items: start; }
.line-head { display: grid; justify-items: center; gap: 2px; padding-top: 4px; }
.line-head small { font-weight: 700; color: var(--green-d); font-size: 12px; }
.pos { display: inline-block; min-width: 38px; text-align: center; padding: 1px 4px; border-radius: 8px; color: #fff; font-weight: 700; font-size: 12px; background: var(--wood); }
.pos.small { min-width: 30px; font-size: 10px; margin-right: 6px; }
.p-GK { background: #f2a72a; } .p-DEF { background: #3a8ee0; } .p-MID { background: #3aa655; } .p-ATT { background: #e5402f; }
.line-players { display: flex; flex-wrap: wrap; gap: 6px; }
.pl { display: grid; grid-template-columns: auto auto; gap: 0 6px; align-items: center; padding: 4px 8px; border-radius: 10px; background: #fff; border: 2px solid #eadbb8; text-align: left; min-width: 120px; }
.pl-name { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px; }
.pl-meta { font-size: 11px; color: var(--muted); }
.fit { grid-column: 1 / -1; height: 4px; border-radius: 3px; background: #eadbb8; overflow: hidden; margin-top: 2px; }
.fit i { display: block; height: 100%; background: linear-gradient(90deg, #f2a72a, #5cc23a); }
.pl.in { border-color: var(--green); background: #f1fae6; box-shadow: 0 2px 0 rgba(47, 138, 28, 0.25); }
.pl.tired .fit i { background: #f2a72a; }
.pl.hurt { opacity: 0.5; text-decoration: line-through; }
.sub { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
.ht { display: grid; gap: 6px; }
.ht-row { display: grid; grid-template-columns: 140px 1fr; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
.ht-row select { font: inherit; font-size: 14px; padding: 5px 8px; border-radius: 10px; border: 2px solid #e2cc9c; background: #fff; color: var(--ink); }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.opts { display: grid; gap: 6px; }
.opt { display: grid; padding: 6px 10px; border-radius: 10px; border: 2px solid #eadbb8; background: #fff; text-align: left; }
.opt small { color: var(--muted); font-size: 12px; }
.opt.on { border-color: var(--green); background: #f1fae6; }
.prep-side { display: grid; gap: 10px; position: sticky; top: 0; }
.pcard { padding: 12px; border-radius: 16px; background: #fffaf0; border: 2px solid #eadbb8; }
.sc-row { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; border-bottom: 1px dashed #eadbb8; }
.sc-row span:first-child { color: var(--muted); font-size: 13px; min-width: 70px; }
.sc-row small { margin-left: auto; color: var(--muted); }
.sc-tip { display: flex; align-items: center; gap: 8px; margin: 8px 0; padding: 6px 10px; border-radius: 10px; background: #eaf8e0; border: 2px solid #bfe3a5; color: var(--green-d); font-size: 14px; }
.sc-tip .btn { margin-left: auto; }
.keys { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 3px; font-size: 13px; }
.sc-note { margin: 6px 0 0; font-size: 12px; color: var(--muted); font-style: italic; }
.formrow i { display: inline-block; width: 18px; text-align: center; border-radius: 5px; color: #fff; font-style: normal; font-size: 11px; margin-left: 2px; }
.odds { transition: opacity 0.2s; }
.odds.busy { opacity: 0.7; }
.oddsbar { display: flex; height: 30px; border-radius: 10px; overflow: hidden; border: 2px solid #c9a46a; background: #eee; }
.oddsbar i { display: grid; place-items: center; font-style: normal; font-weight: 700; font-size: 13px; color: #fff; transition: width 0.35s ease; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.3); }
.oddsbar .w { background: var(--green); } .oddsbar .d { background: var(--gold); } .oddsbar .l { background: var(--red); }
.oddslegend { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 2px; }
.xscore { margin: 8px 0; font-size: 14px; }
.delta { display: block; font-size: 12px; font-weight: 700; color: var(--muted); }
.delta.up { color: var(--green-d); } .delta.down { color: var(--red); }
.factors { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.factors li { display: grid; padding: 4px 8px; border-radius: 8px; font-size: 12px; border-left: 4px solid #c9b48a; background: #fff; }
.factors li b { font-size: 13px; }
.factors li.good { border-left-color: var(--green); } .factors li.bad { border-left-color: var(--red); }
.runs { display: block; margin-top: 6px; color: var(--muted); font-size: 11px; }
.save { display: grid; gap: 6px; }
.def { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.btn.big { padding: 12px; font-size: 18px; }
@media (max-width: 900px) {
  .prep-grid { grid-template-columns: 1fr; }
  .prep-side { position: static; }
  .styles { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 14px; }
  .two-col { grid-template-columns: 1fr; }
  .slider { grid-template-columns: 90px 36px 1fr 36px 20px; }
  .ht-row { grid-template-columns: 1fr; }
}
</style>
