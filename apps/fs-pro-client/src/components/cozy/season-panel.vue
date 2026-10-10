<template>
  <section class="sea">
    <div v-if="loading && !season" class="sea-state">Loading the season…</div>
    <div v-else-if="error && !season" class="sea-state bad" role="alert">
      <p>{{ error }}</p>
      <button class="btn small" @click="load">Try again</button>
    </div>

    <template v-else-if="season">
      <header class="sea-head">
        <h2><span class="ic" v-html="icon('star')"></span> Season {{ season.seasonKey }}</h2>
        <button class="btn small" @click="load">Refresh</button>
      </header>

      <div class="sea-card hero">
        <div class="hero-top">
          <span class="tier">Tier {{ season.tier }}<small>/{{ season.maxTier }}</small></span>
          <span class="chip" :class="{ on: season.hasPass }">
            {{ season.hasPass ? "Director's Pass" : 'Standard Track' }}
          </span>
        </div>
        <div class="bar"><i :style="{ width: `${Math.round(season.progress.pct * 100)}%` }"></i></div>
        <p class="note">
          {{ count(season.points) }} points<template v-if="season.progress.next"> · next tier at {{ count(season.progress.next) }}</template>
          <template v-if="season.endsAt">
            · ends <cozy-countdown :at="season.endsAt" :server-now="season.now" />
          </template>
        </p>
      </div>

      <!-- Objectives -->
      <div class="sea-card">
        <h3>Objectives</h3>
        <ul class="sea-list">
          <li v-for="o in season.objectives" :key="o.id" class="sea-row">
            <div class="row-top">
              <b>{{ o.title }}</b>
              <span class="scope" :class="{ shared: o.scope === 'shared' }">{{ o.scope }}</span>
            </div>
            <div class="bar small"><i :style="{ width: `${Math.round(o.fill * 100)}%` }"></i></div>
            <div class="row-meta">
              <span>{{ o.progress }} / {{ o.goal }} · {{ o.points }} pts</span>
              <span v-if="o.claimed" class="done">Claimed</span>
              <button v-else-if="o.complete" class="btn tiny primary" :disabled="busy === o.id" @click="claimObjective(o.id)">
                {{ busy === o.id ? '…' : 'Claim' }}
              </button>
              <span v-else class="pending">In progress</span>
            </div>
          </li>
        </ul>
      </div>

      <!-- Standard / Director's tracks -->
      <div class="sea-card">
        <div class="card-head">
          <h3>Tracks</h3>
          <span class="note">Standard is free · Pass required for Director's track</span>
        </div>
        <div class="tracks">
          <div class="track">
            <div class="track-head silver">Standard</div>
            <button
              class="btn tiny primary"
              :disabled="!nextSilver || busy === 'silver'"
              @click="claimPass('silver')"
            >
              {{ busy === 'silver' ? '…' : nextSilver ? `Claim tier ${nextSilver.tier}` : 'Up to date' }}
            </button>
          </div>
          <div class="track">
            <div class="track-head gold">Director's</div>
            <button
              class="btn tiny primary"
              :disabled="!nextGold || busy === 'gold'"
              @click="claimPass('gold')"
            >
              {{ busy === 'gold' ? '…' : nextGold ? `Claim tier ${nextGold.tier}` : season.hasPass ? 'Up to date' : 'Needs pass' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Season Dividend -->
      <div v-if="bank" class="sea-card">
        <div class="card-head">
          <h3>Season Dividend</h3>
          <span class="chip">20% of match rewards</span>
        </div>
        <div class="bank-grid">
          <div class="pstat"><b>{{ currency(bank.accrued) }}</b><small>accrued</small></div>
          <div class="pstat"><b>{{ currency(bank.claimed) }}</b><small>claimed</small></div>
          <div class="pstat"><b>{{ currency(bank.claimable) }}</b><small>claimable</small></div>
        </div>
        <button class="btn primary" :disabled="!bank.claimable || busy === 'bank'" @click="claimBank">
          {{ busy === 'bank' ? 'Claiming…' : bank.open ? 'Claim Season Dividend' : 'Claimable at season end' }}
        </button>
      </div>

      <!-- Board Perks -->
      <div class="sea-card">
        <div class="card-head">
          <h3>Board Perks</h3>
          <span class="note">{{ owned.length }} owned</span>
        </div>
        <ul class="sea-list">
          <li v-for="p in season.perks" :key="p.key" class="sea-row perk" :class="{ off: p.count <= 0 }">
            <div class="row-top">
              <b>{{ p.name }}</b>
              <span class="count">×{{ p.count }}</span>
            </div>
            <div class="row-meta">
              <span class="cat">{{ p.category }}</span>
              <template v-if="needsTarget(p.category)">
                <select v-if="p.key === 'research_finish'" v-model="targets[p.key]" class="target">
                  <option value="coaching_dept">Coaching Dept</option>
                  <option value="video_analysis">Video Analysis</option>
                </select>
                <input v-else v-model="targets[p.key]" class="target" placeholder="facility key" />
              </template>
              <button class="btn tiny primary" :disabled="p.count <= 0 || busy === p.key" @click="usePerk(p.key, p.category)">
                {{ busy === p.key ? '…' : 'Use' }}
              </button>
            </div>
            <p class="note kind">{{ perkKind(p.category) }}</p>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { client } from '@/services/api';
import { payloadOrNull } from '@/helpers/envelope';
import { currency } from '@/helpers/misc';
import {
  coerceSeason,
  nextClaimableTier,
  ownedPerks,
  type SeasonView,
} from '@/helpers/season-pass';
import type { PerkTarget } from '@repo/api-contract';
import { icon } from './icons';
import CozyCountdown from './cozy-countdown.vue';

/**
 * The Season & Club-Legacy season half (docs/coc-mapping/04 §6-§7, 08 §2 P8,
 * OW-N10): Season Objectives with server-evaluated progress, the Silver/Gold
 * track claims, the Season Bank and the Board Perk inventory consumed through
 * `campus.usePerk`. The season key and `endsAt` are absolute UTC (04 §12);
 * completion is never taken from the client (05 §6). Plain HTML/CSS + tokens.
 */
const props = defineProps<{ clubId: string }>();
const emit = defineEmits<{ (e: 'toast', text: string, level?: 'success' | 'error'): void }>();

const season = ref<SeasonView | null>(null);
const loading = ref(false);
const error = ref('');
/** The key of the row currently mutating (objective id, track, 'bank', perk). */
const busy = ref('');
const targets = reactive<Record<string, string>>({});

const bank = computed(() => season.value?.bank ?? null);
const nextSilver = computed(() => (season.value ? nextClaimableTier(season.value, 'silver') : null));
const nextGold = computed(() => (season.value ? nextClaimableTier(season.value, 'gold') : null));
const owned = computed(() => (season.value ? ownedPerks(season.value) : []));

const count = (n: number) => Math.floor(n).toLocaleString('en-US');

function needsTarget(category: string): boolean {
  return category === 'construction' || category === 'research';
}

function perkKind(category: string): string {
  switch (category) {
    case 'construction':
      return 'Finishes or accelerates a running campus upgrade (needs a facility key).';
    case 'research':
      return 'Finishes a running Coaching Dept / Video Analysis upgrade.';
    case 'combat':
      return 'A recorded combat redemption.';
    case 'cosmetic':
      return 'A recorded cosmetic redemption.';
    default:
      return 'An instant currency grant.';
  }
}

function instanceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function apply(raw: unknown) {
  const next = coerceSeason(raw);
  if (next) season.value = next;
  return next;
}

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  const res = await client.season.get.query({ params: { clubId: props.clubId } });
  if (!apply(payloadOrNull(res))) error.value = 'Could not load the season.';
  loading.value = false;
}

async function claimObjective(objectiveId: string) {
  if (!props.clubId || busy.value) return;
  busy.value = objectiveId;
  const res = await client.season.claimObjective.mutation({
    params: { clubId: props.clubId, objectiveId },
    body: {},
  });
  if (apply(payloadOrNull(res))) emit('toast', 'Objective claimed.');
  else emit('toast', 'Could not claim that objective.', 'error');
  busy.value = '';
}

async function claimPass(track: 'silver' | 'gold') {
  if (!props.clubId || busy.value) return;
  busy.value = track;
  const res = await client.season.claimPass.mutation({
    params: { clubId: props.clubId },
    body: { track },
  });
  if (apply(payloadOrNull(res))) emit('toast', `${track} reward claimed.`);
  else emit('toast', `Could not claim the ${track} track.`, 'error');
  busy.value = '';
}

async function claimBank() {
  if (!props.clubId || busy.value) return;
  busy.value = 'bank';
  const res = await client.season.claimBank.mutation({
    params: { clubId: props.clubId },
    body: {},
  });
  if (apply(payloadOrNull(res))) emit('toast', 'Season Dividend claimed.');
  else emit('toast', 'Nothing to claim from the dividend yet.', 'error');
  busy.value = '';
}

async function usePerk(perk: string, category: string) {
  if (!props.clubId || busy.value) return;
  busy.value = perk;
  const target = needsTarget(category) ? (targets[perk] ?? '').trim() : '';
  const res = await client.campus.usePerk.mutation({
    params: { clubId: props.clubId },
    body: {
      perk,
      instanceId: instanceId(),
      ...(target ? { target: target as PerkTarget } : {}),
    },
  });
  if (payloadOrNull(res)) {
    emit('toast', `${perk.replace(/_/g, ' ')} redeemed.`);
    await load();
  } else {
    emit('toast', 'Could not redeem that perk.', 'error');
  }
  busy.value = '';
}

onMounted(load);
</script>

<style scoped>
.sea {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.sea-state {
  padding: 20px;
  text-align: center;
}
.sea-state.bad {
  color: var(--red, #e5402f);
}
.sea-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sea-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
}
.sea-head .ic {
  width: 24px;
  height: 24px;
}
.sea-card {
  padding: 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sea-card.hero {
  background: linear-gradient(#f3ecff, #e6dcff);
}
.sea-card h3 {
  margin: 0;
  font-size: 16px;
}
.hero-top,
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tier {
  font-size: 22px;
  font-weight: 800;
}
.tier small {
  font-size: 13px;
  color: var(--muted, #6f5940);
}
.chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: #fff8e6;
  border: 2px solid #e2cc9c;
  font-size: 12px;
  font-weight: 700;
}
.chip.on {
  color: #8a6a12;
  border-color: var(--gold, #f5b82e);
  background: #fff4d2;
}
.bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(138, 90, 59, 0.15);
  overflow: hidden;
}
.bar.small {
  height: 7px;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #8a6ae0, #5cc23a);
}
.sea-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sea-row {
  padding: 8px 10px;
  border-radius: 11px;
  background: #fffdf7;
  border: 2px solid #eadbb8;
}
.sea-row.off {
  opacity: 0.6;
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
.scope {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted, #6f5940);
}
.scope.shared {
  color: #6d4fbf;
  font-weight: 700;
}
.count,
.cat {
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted, #6f5940);
}
.done {
  color: var(--green-d, #2f8a1c);
  font-weight: 700;
}
.pending {
  font-style: italic;
}
.tracks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.track {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 11px;
  border: 2px solid #eadbb8;
  background: #fffdf7;
}
.track-head {
  font-weight: 800;
  font-size: 15px;
}
.track-head.silver {
  color: #7b8496;
}
.track-head.gold {
  color: #b8860b;
}
.bank-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.pstat {
  display: flex;
  flex-direction: column;
}
.pstat small {
  font-size: 11px;
  color: var(--muted, #6f5940);
}
.pstat b {
  font-size: 16px;
}
.target {
  font: inherit;
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 8px;
  border: 2px solid #e2cc9c;
  background: #fffaf0;
  max-width: 140px;
}
.note {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted, #6f5940);
}
.note.kind {
  margin-top: 4px;
}
.btn.tiny {
  padding: 2px 10px;
  font-size: 12px;
}
</style>
