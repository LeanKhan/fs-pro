<template>
  <section class="scr">
    <div v-if="loading" class="scr-state">Reading their shape…</div>

    <div v-else-if="error" class="scr-state bad" role="alert">
      <p>{{ error }}</p>
      <button class="btn small" @click="load">Try again</button>
    </div>

    <template v-else-if="report">
      <header class="scr-head">
        <img
          class="scr-crest"
          :src="crestUrl(report.opponent.code)"
          :alt="report.opponent.name"
          width="64"
          height="64"
          @error="crestFallback($event, report.opponent.name)"
        />
        <div class="scr-id">
          <h2>{{ report.opponent.name }}</h2>
          <span v-if="report.opponent.code" class="scr-code">
            {{ report.opponent.code }}
          </span>
        </div>
        <ul class="scr-meta">
          <li><small>Clubhouse</small><b>T{{ report.tier }}</b></li>
          <li><small>League</small><b>{{ report.league }}</b></li>
          <li><small>Scouting</small><b>L{{ report.scoutingLevel }}</b></li>
          <li class="band" :title="bandHint">
            <small>Power</small><b>{{ report.band.label }}</b>
          </li>
        </ul>
      </header>

      <p class="scr-hint">{{ bandHint }}</p>
      <p v-for="(note, i) in report.notes" :key="i" class="scr-note">
        {{ note }}
      </p>

      <template v-if="report.hasGrid">
        <div class="scr-read">
          <div class="scr-lanes">
            <h3>Strongest lanes</h3>
            <ul>
              <li v-for="lane in report.lanes" :key="lane.name">
                <span class="lane-name">{{ laneLabel(lane.name) }}</span>
                <span class="lane-bar" aria-hidden="true">
                  <i :style="{ width: pct(lane.share) }"></i>
                </span>
                <b>{{ lane.players }}</b>
              </li>
            </ul>
          </div>
          <div class="scr-occupancy">
            <h3>Occupancy</h3>
            <div
              class="occ-row"
              role="list"
              aria-label="Outfield players per column, X0 to X8"
            >
              <span
                v-for="(n, col) in report.occupancy"
                :key="col"
                class="occ"
                :class="{ hot: n > 0 }"
                role="listitem"
                :title="`X${col}: ${n}`"
              >
                <i>{{ n }}</i><em>X{{ col }}</em>
              </span>
            </div>
            <p class="scr-intent">
              {{ report.highLine ? 'High line — they stand up the pitch.' : 'Deep block.' }}
              <template v-if="report.attacking">
                {{ report.attacking }} committed to the final third.
              </template>
            </p>
          </div>
        </div>

        <pitch-grid-editor
          mode="scout"
          :club-id="clubId"
          :external-grid="externalGrid"
          :external-tier="report.tier"
          :heading="report.opponent.name"
          :threat-occupancy="report.occupancy"
        />
      </template>

      <div v-else class="scr-empty">
        <span class="ic" v-html="icon('map')"></span>
        <p>They have not set a Home Grid yet — no tactical setup to analyse.</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GridSlot } from '@repo/api-contract';
import { client } from '@/services/api';
import { crestUrl } from '@/helpers/crest';
import { coerceScoutReport, laneLabel, type ScoutReportView } from '@/helpers/scout-report';
import { crestFallback } from './club-colors';
import { icon } from './icons';
import PitchGridEditor from './grid/pitch-grid-editor.vue';

/**
 * The Scout screen (docs/coc-mapping/08 §6.1, 03 §1.7): the "crack the base"
 * surface. Given an opponent id it calls the typed `play.scoutOpponent` route
 * and renders, read-only, their Home Grid via the shared grid board (`scout`
 * mode) with the coarse threat read (strongest lanes + per-column occupancy)
 * overlaid, plus tier/league and a **masked** power band — never an exact rating.
 *
 * The server is authoritative: this component only coerces the report into a
 * render-safe view model (`@/helpers/scout-report`). Plain HTML/CSS + cozy
 * tokens; no Vuetify.
 */
const props = defineProps<{ clubId: string; opponentId: string }>();
const emit = defineEmits<{
  (e: 'toast', text: string, level?: 'success' | 'error'): void;
}>();

const loading = ref(true);
const error = ref('');
const report = ref<ScoutReportView | null>(null);

const externalGrid = computed<{ slots: GridSlot[] } | null>(() =>
  report.value?.homeGrid ? { slots: report.value.homeGrid } : null
);

const bandHint =
  'Masked by your Scouting Department — the exact rating stays hidden.';

function pct(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

async function load() {
  if (!props.opponentId) {
    loading.value = false;
    error.value = 'Pick an opponent to scout.';
    return;
  }
  loading.value = true;
  error.value = '';
  report.value = null;
  try {
    const res = await client.play.scoutOpponent.mutation({
      params: { clubId: props.clubId, oppId: props.opponentId },
      body: {},
    });
    if (res.status !== 200) {
      error.value = res.body.message;
      emit('toast', res.body.message, 'error');
      return;
    }
    const view = coerceScoutReport(res.body.payload);
    if (!view) {
      error.value = 'That scout report could not be read.';
      return;
    }
    report.value = view;
  } catch (err) {
    console.error('Failed to scout the opponent:', err);
    error.value = 'Could not read the scout report.';
  } finally {
    loading.value = false;
  }
}

watch(() => [props.clubId, props.opponentId], load, { immediate: true });
</script>

<style scoped>
.scr {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.scr-state {
  padding: 20px;
  text-align: center;
  font-size: 16px;
}
.scr-state.bad {
  color: var(--red, #e5402f);
}
.scr-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 14px;
  background: linear-gradient(#fff8e6, #f6e7c4);
  border: 3px solid #e2cc9c;
}
.scr-crest {
  width: 64px;
  height: 64px;
  object-fit: contain;
  flex: none;
}
.scr-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
}
.scr-id h2 {
  margin: 0;
  font-size: 22px;
}
.scr-code {
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--muted, #6f5940);
}
.scr-meta {
  list-style: none;
  margin: 0 0 0 auto;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.scr-meta li {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 4px 10px;
  border-radius: 10px;
  background: #fffaf0;
  border: 2px solid #e2cc9c;
  min-width: 74px;
}
.scr-meta small {
  font-size: 11px;
  color: var(--muted, #6f5940);
}
.scr-meta b {
  font-size: 15px;
}
.scr-meta .band {
  border-color: var(--gold, #f5b82e);
  background: linear-gradient(#fffaf0, #fff1c4);
}
.scr-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.scr-note {
  margin: 0;
  padding: 6px 10px;
  border-radius: 10px;
  background: #e9f7e2;
  border: 2px solid var(--green, #5cc23a);
  font-size: 13px;
  font-weight: 600;
}
.scr-read {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
@media (max-width: 640px) {
  .scr-read {
    grid-template-columns: 1fr;
  }
}
.scr-lanes h3,
.scr-occupancy h3 {
  margin: 0 0 6px;
  font-size: 15px;
}
.scr-lanes ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scr-lanes li {
  display: grid;
  grid-template-columns: 84px 1fr 20px;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.lane-bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(138, 90, 59, 0.15);
  overflow: hidden;
}
.lane-bar i {
  display: block;
  height: 100%;
  background: var(--blue, #3a8ee0);
}
.occ-row {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 3px;
}
.occ {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
  border-radius: 7px;
  background: rgba(138, 90, 59, 0.08);
  border: 2px solid transparent;
}
.occ.hot {
  background: rgba(229, 64, 47, 0.14);
  border-color: rgba(229, 64, 47, 0.6);
}
.occ i {
  font-weight: 800;
  font-style: normal;
}
.occ em {
  font-size: 10px;
  font-style: normal;
  color: var(--muted, #6f5940);
}
.scr-intent {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted, #6f5940);
}
.scr-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-radius: 12px;
  background: #fffaf0;
  border: 3px dashed #e2cc9c;
  color: var(--muted, #6f5940);
}
.scr-empty .ic {
  width: 28px;
  height: 28px;
}
</style>
