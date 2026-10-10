<template>
  <section class="leg">
    <div v-if="loading && !legacy" class="leg-state">Loading Club Legacy…</div>
    <div v-else-if="error && !legacy" class="leg-state bad" role="alert">
      <p>{{ error }}</p>
      <button class="btn small" @click="load">Try again</button>
    </div>

    <template v-else-if="legacy">
      <header class="leg-head">
        <h2><span class="ic" v-html="icon('trophy')"></span> Club Legacy</h2>
        <button class="btn small" @click="load">Refresh</button>
      </header>

      <div class="leg-card hero">
        <div class="hero-top">
          <span class="stars">{{ legacy.totalStars }} / {{ legacy.maxStars }}★</span>
          <span class="chip" :class="{ done: legacy.complete }">
            {{ legacy.complete ? 'Complete' : `${remainingSteps(legacy)} to go` }}
          </span>
        </div>
        <div class="bar"><i :style="{ width: pct(legacy.totalStars, legacy.maxStars) }"></i></div>
        <p class="note">
          Groundskeepers {{ legacy.groundskeepers.count }} / {{ legacy.groundskeepers.max }} ·
          completing the chain grants the 6th.
        </p>
        <button class="btn primary" :disabled="!legacyClaimable(legacy) || claiming" @click="claim">
          {{ legacy.granted > 0 ? 'Groundskeeper granted' : claiming ? 'Claiming…' : 'Claim the 6th Groundskeeper' }}
        </button>
      </div>

      <div class="leg-card">
        <h3>Chain</h3>
        <ul class="leg-list">
          <li v-for="s in legacy.chain" :key="s.id" class="leg-row" :class="{ met: s.met }">
            <span class="mark" v-html="icon(s.met ? 'check' : 'clock')"></span>
            <div class="row-body">
              <div class="row-top">
                <b>{{ s.label }}</b>
                <span class="stars-mini">{{ s.progress }} / {{ s.stars }}★</span>
              </div>
              <div class="bar small"><i :style="{ width: pct(s.progress, s.stars) }"></i></div>
            </div>
          </li>
        </ul>
      </div>

      <div class="leg-card">
        <h3>Honours</h3>
        <ul class="leg-list">
          <li v-for="h in honours" :key="h.code" class="leg-row" :class="{ met: h.completed }">
            <span class="mark" v-html="icon(h.completed ? 'star' : 'clock')"></span>
            <div class="row-body">
              <div class="row-top">
                <b>{{ h.title }}</b>
                <span class="stars-mini">{{ h.progress }} / {{ h.goal }}</span>
              </div>
              <div class="bar small"><i :style="{ width: Math.round(h.fill * 100) + '%' }"></i></div>
              <div class="row-meta">
                <span v-if="h.reward.sponsorCredits">{{ h.reward.sponsorCredits }} credits</span>
                <span v-if="h.reward.cash">{{ currency(h.reward.cash) }}</span>
                <span v-for="perk in h.reward.perks" :key="perk.key" class="perkchip">
                  {{ perk.key.replace(/_/g, ' ') }} ×{{ perk.count }}
                </span>
                <span v-if="h.completed" class="done">Complete</span>
                <span v-else-if="h.complete" class="done">Claim at the honours board</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { client } from '@/services/api';
import { payloadOrNull } from '@/helpers/envelope';
import { currency } from '@/helpers/misc';
import {
  coerceHonours,
  coerceLegacy,
  legacyClaimable,
  remainingSteps,
  type HonourView,
  type LegacyView,
} from '@/helpers/legacy-chain';
import { icon } from './icons';

/**
 * The Club Legacy surface (docs/coc-mapping/02 §I/§K, 04 §2, 08 §2 P8, OW-N10):
 * the long-horizon chain that grants the 6th Groundskeeper (via `legacy.claim`)
 * plus the Club Honours list (`honours.list`). Reads are coerced because the Go
 * handlers return untyped maps. Plain HTML/CSS + cozy tokens.
 */
const props = defineProps<{ clubId: string }>();
const emit = defineEmits<{ (e: 'toast', text: string, level?: 'success' | 'error'): void }>();

const legacy = ref<LegacyView | null>(null);
const listHonours = ref<HonourView[]>([]);
const loading = ref(false);
const claiming = ref(false);
const error = ref('');

const honours = computed<HonourView[]>(() =>
  listHonours.value.length ? listHonours.value : (legacy.value?.honours ?? [])
);

function pct(value: number, max: number): string {
  return `${Math.round((max > 0 ? Math.min(1, Math.max(0, value / max)) : 1) * 100)}%`;
}

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  const [l, h] = await Promise.all([
    client.legacy.get.query({ params: { clubId: props.clubId } }),
    client.honours.list.query({ params: { clubId: props.clubId } }),
  ]);
  const next = coerceLegacy(payloadOrNull(l));
  if (next) legacy.value = next;
  const honoursRes = coerceHonours(payloadOrNull(h));
  if (honoursRes) listHonours.value = honoursRes.honours;
  if (!next) error.value = 'Could not load Club Legacy.';
  loading.value = false;
}

async function claim() {
  if (!props.clubId || claiming.value) return;
  claiming.value = true;
  const res = await client.legacy.claim.mutation({
    params: { clubId: props.clubId },
    body: {},
  });
  const next = coerceLegacy(payloadOrNull(res));
  if (next) {
    legacy.value = next;
    emit('toast', 'The 6th Groundskeeper joins your staff.');
  } else {
    emit('toast', 'The chain is not complete yet.', 'error');
  }
  claiming.value = false;
}

onMounted(load);
</script>

<style scoped>
.leg {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.leg-state {
  padding: 20px;
  text-align: center;
}
.leg-state.bad {
  color: var(--red, #e5402f);
}
.leg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.leg-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
}
.leg-head .ic {
  width: 24px;
  height: 24px;
}
.leg-card {
  padding: 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.leg-card.hero {
  background: linear-gradient(#fff6df, #f7e6bd);
}
.leg-card h3 {
  margin: 0;
  font-size: 16px;
}
.hero-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.stars {
  font-size: 22px;
  font-weight: 800;
}
.chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: #fff8e6;
  border: 2px solid #e2cc9c;
  font-size: 12px;
  font-weight: 700;
}
.chip.done {
  color: #2f8a1c;
  border-color: #bfe3a5;
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
  background: linear-gradient(90deg, var(--gold, #f5b82e), var(--green, #5cc23a));
}
.leg-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.leg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 11px;
  background: #fffdf7;
  border: 2px solid #eadbb8;
}
.leg-row.met {
  border-color: #bfe3a5;
  background: #f6fdf1;
}
.mark {
  width: 24px;
  height: 24px;
  flex: none;
  display: inline-flex;
}
.mark :deep(.ic) {
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
.stars-mini {
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
.perkchip {
  padding: 1px 7px;
  border-radius: 999px;
  background: #fff4d2;
  border: 2px solid var(--gold, #f5b82e);
  color: #8a6a12;
  font-weight: 700;
  text-transform: capitalize;
}
.note {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted, #6f5940);
}
</style>
