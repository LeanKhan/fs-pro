<template>
  <section class="cem">
    <div v-if="loading && !campus" class="cem-state">Loading the grounds…</div>

    <div v-else-if="error && !campus" class="cem-state bad" role="alert">
      <p>{{ error }}</p>
      <button class="btn small" @click="load">Try again</button>
    </div>

    <template v-else-if="campus">
      <header class="cem-head">
        <h2><span class="ic" v-html="icon('map')"></span> Grounds</h2>
        <ul class="cem-res">
          <li><small>Cash</small><b>{{ currency(campus.cash) }}</b></li>
          <li><small>Fans</small><b>{{ count(campus.fans) }}</b></li>
          <li><small>Tokens</small><b>{{ count(campus.scoutTokens) }}</b></li>
          <li><small>Credits</small><b>{{ count(campus.sponsorCredits) }}</b></li>
          <li><small>Standing</small><b>{{ count(campus.standingPoints) }}</b></li>
        </ul>
      </header>

      <div class="cem-card">
        <div class="cem-card-head">
          <h3>Clubhouse</h3>
          <span class="cem-chip">
            Tier {{ campus.clubhouse.tier }} / {{ campus.clubhouse.maxTier }}
          </span>
        </div>
        <p v-if="clubhouseTimer" class="cem-timer">
          Upgrading to Tier {{ campus.clubhouse.upgradingTo }} —
          <cozy-countdown
            :at="clubhouseTimer.at"
            :server-now="clubhouseTimer.serverNow"
            :on-done="() => onTimerDone('clubhouse', campus.clubhouse.readyAt ?? '')"
          />
        </p>
        <ul v-if="campus.clubhouse.missing.length" class="cem-missing">
          <li v-for="(m, i) in campus.clubhouse.missing" :key="i">
            {{ prettify(m.facility) }} to Level {{ m.level }}
          </li>
        </ul>
      </div>

      <div class="cem-card">
        <div class="cem-card-head">
          <h3>Collectors</h3>
          <button
            class="btn small primary"
            :disabled="!canCollect || collecting"
            @click="onCollectAll"
          >
            {{ collecting ? 'Collecting…' : 'Collect All' }}
          </button>
        </div>
        <ul class="cem-list">
          <li v-for="c in collectors" :key="c.key" class="cem-row">
            <span class="row-ic" v-html="icon(currencyIcon(c.currency))"></span>
            <div class="row-body">
              <div class="row-top">
                <b>{{ c.name }}</b><small>{{ c.label }}</small>
              </div>
              <div class="row-bar" aria-hidden="true">
                <i class="fill" :style="{ width: barPct(c.fill) }"></i>
              </div>
              <div class="row-meta">
                <span>{{ count(c.pending) }} / {{ count(c.capacity) }}</span>
                <span v-if="c.full" class="cap full">Full</span>
                <cozy-countdown
                  v-else
                  :at="c.fullAt"
                  :server-now="campus.now"
                  label="Fills in"
                  :on-done="() => onTimerDone(c.key, c.fullAt)"
                />
                <span class="row-rate">+{{ count(c.productionPerHour) }}/h</span>
              </div>
            </div>
          </li>
          <li v-if="!collectors.length" class="cem-empty">
            No collectors on the grounds.
          </li>
        </ul>
        <p v-if="error" class="cem-error" role="alert">{{ error }}</p>
      </div>

      <div class="cem-card">
        <div class="cem-card-head">
          <h3>Groundskeepers</h3>
          <span class="cem-chip">
            {{ campus.groundskeepers.active }} /
            {{ campus.groundskeepers.count }} busy
          </span>
        </div>
        <ul class="cem-list">
          <li v-for="t in buildTimers" :key="t.key" class="cem-timer-row">
            <span class="row-ic" v-html="icon('hammer')"></span>
            <span class="tm-label">{{ t.label }}</span>
            <cozy-countdown
              :at="t.at"
              :server-now="t.serverNow"
              :on-done="() => onTimerDone(t.key, t.at)"
            />
          </li>
          <li v-if="!buildTimers.length" class="cem-empty">
            No builders at work.
          </li>
        </ul>
        <p v-if="nextGroundskeeper" class="cem-hint">
          Next Groundskeeper:
          {{ count(nextGroundskeeper.cost) }} {{ nextGroundskeeper.currency }}
        </p>
      </div>

      <div v-if="guardTimer" class="cem-card">
        <div class="cem-card-head">
          <h3>Warm-up Guard</h3>
        </div>
        <p class="cem-timer">
          <cozy-countdown
            :at="guardTimer.at"
            :server-now="guardTimer.serverNow"
            label="Guard ends in"
            :on-done="() => onTimerDone('guard', guardTimer.at)"
          />
        </p>
      </div>

      <div class="cem-card">
        <div class="cem-card-head">
          <h3>Vaults</h3>
        </div>
        <ul class="cem-list">
          <li v-for="v in vaults" :key="v.currency" class="cem-row">
            <span class="row-ic" v-html="icon(currencyIcon(v.currency))"></span>
            <div class="row-body">
              <div class="row-top">
                <b>{{ v.label }}</b><small>Level {{ v.level }}</small>
              </div>
              <div class="row-bar" aria-hidden="true">
                <i class="vault" :style="{ width: barPct(v.fill) }"></i>
              </div>
              <div class="row-meta">
                <span>
                  {{ amount(v.currency, v.balance) }}
                  <em>/ {{ amount(v.currency, v.capacity) }}</em>
                </span>
                <span v-if="v.full" class="cap full">Full</span>
              </div>
            </div>
          </li>
          <li v-if="!vaults.length" class="cem-empty">No vaults yet.</li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, toRef } from 'vue';
import type { CampusCurrency } from '@repo/api-contract';
import { currency } from '@/helpers/misc';
import {
  campusTimers,
  collectorViews,
  currencyLabel,
  vaultsView,
} from '@/helpers/campus-queue';
import { useCampusCollect } from '@/composables/use-campus-collect';
import { icon } from './icons';
import CozyCountdown from './cozy-countdown.vue';

/**
 * The Campus economy screen (docs/coc-mapping/08 §4.1, P1): Clubhouse tier, the
 * collectors with a one-tap "Collect All", the Groundskeepers' builders queue,
 * vault balances/caps and the Warm-up Guard — every timer rendered through
 * `CozyCountdown` off the server's absolute UTC timestamps and `campus.now`
 * (04 §12). Collect All is optimistic and reconciles from `campus.collect`; the
 * server stays authoritative.
 *
 * Plain HTML/CSS + cozy tokens; no Vuetify.
 */
const props = defineProps<{ clubId: string }>();
const emit = defineEmits<{
  (e: 'toast', text: string, level?: 'success' | 'error'): void;
}>();

const { campus, loading, collecting, error, canCollect, load, collectAll } =
  useCampusCollect(toRef(props, 'clubId'));

const collectors = computed(() =>
  campus.value ? collectorViews(campus.value) : []
);
const vaults = computed(() => (campus.value ? vaultsView(campus.value) : []));

const timers = computed(() => (campus.value ? campusTimers(campus.value) : []));
const clubhouseTimer = computed(
  () => timers.value.find((t) => t.kind === 'clubhouse') ?? null
);
const buildTimers = computed(() =>
  timers.value.filter((t) => t.kind === 'build')
);
const guardTimer = computed(
  () => timers.value.find((t) => t.kind === 'guard') ?? null
);

const nextGroundskeeper = computed(() => {
  const g = campus.value?.groundskeepers;
  if (!g || g.nextCost === null || !g.nextCurrency) return null;
  return { cost: g.nextCost, currency: currencyLabel(g.nextCurrency) };
});

const count = (n: number) => Math.floor(n).toLocaleString('en-US');

function amount(cur: CampusCurrency, value: number): string {
  return cur === 'cash' ? currency(value) : count(value);
}

function barPct(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function currencyIcon(cur: CampusCurrency): string {
  if (cur === 'fans') return 'people';
  if (cur === 'scout_tokens') return 'star';
  if (cur === 'sponsor_credits') return 'bolt';
  return 'coins';
}

function prettify(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function onCollectAll() {
  const fresh = await collectAll();
  if (fresh) emit('toast', 'Collected the grounds.');
  else if (error.value) emit('toast', error.value, 'error');
}

/**
 * When a cosmetic timer crosses zero, confirm with the server once per distinct
 * deadline (08 §4.1: completion is the server's to declare). Deduped by
 * scope+deadline so a permanently-ready timer never spins a refresh loop.
 */
const confirmed = new Set<string>();
function onTimerDone(scope: string, at: string) {
  const id = `${scope}@${at}`;
  if (confirmed.has(id)) return;
  confirmed.add(id);
  void load();
}

onMounted(load);
</script>

<style scoped>
.cem {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.cem-state {
  padding: 20px;
  text-align: center;
  font-size: 16px;
}
.cem-state.bad {
  color: var(--red, #e5402f);
}
.cem-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cem-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 22px;
}
.cem-head .ic {
  width: 26px;
  height: 26px;
}
.cem-res {
  list-style: none;
  margin: 0 0 0 auto;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cem-res li {
  display: flex;
  flex-direction: column;
  padding: 3px 9px;
  border-radius: 9px;
  background: #fffaf0;
  border: 2px solid #e2cc9c;
}
.cem-res small {
  font-size: 10px;
  color: var(--muted, #6f5940);
}
.cem-res b {
  font-size: 14px;
}
.cem-card {
  padding: 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
}
.cem-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.cem-card-head h3 {
  margin: 0;
  font-size: 17px;
}
.cem-chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: linear-gradient(#fff8e6, #f1dfb6);
  border: 2px solid #e2cc9c;
  font-weight: 700;
  font-size: 13px;
}
.cem-timer {
  margin: 8px 0 0;
  font-size: 14px;
}
.cem-missing {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--muted, #6f5940);
}
.cem-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cem-row,
.cem-timer-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.row-ic {
  width: 26px;
  height: 26px;
  flex: none;
  display: inline-flex;
}
.row-ic :deep(.ic) {
  width: 100%;
  height: 100%;
}
.row-body {
  flex: 1;
  min-width: 0;
}
.row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.row-top b {
  font-size: 14px;
}
.row-top small {
  color: var(--muted, #6f5940);
  font-size: 12px;
}
.row-bar {
  height: 9px;
  margin: 4px 0;
  border-radius: 999px;
  background: rgba(138, 90, 59, 0.15);
  overflow: hidden;
}
.row-bar i {
  display: block;
  height: 100%;
  background: var(--green, #5cc23a);
}
.row-bar i.vault {
  background: var(--gold, #f5b82e);
}
.row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.row-meta em {
  font-style: normal;
  opacity: 0.7;
}
.row-rate {
  margin-left: auto;
  font-weight: 700;
  color: var(--green-d, #2f8a1c);
}
.cap.full {
  padding: 1px 8px;
  border-radius: 999px;
  background: #fbe0dc;
  border: 2px solid var(--red, #e5402f);
  color: #7a2015;
  font-weight: 700;
}
.cem-timer-row .tm-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
}
.cem-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.cem-empty {
  font-size: 13px;
  color: var(--muted, #6f5940);
  padding: 4px 2px;
}
.cem-error {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--red, #e5402f);
}
</style>
