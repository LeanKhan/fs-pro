<template>
  <section class="pre">
    <div v-if="loading && !tour" class="pre-state">Loading the Tour…</div>
    <div v-else-if="error && !tour" class="pre-state bad" role="alert">
      <p>{{ error }}</p>
      <button class="btn small" @click="load">Try again</button>
    </div>

    <template v-else-if="tour">
      <header class="pre-head">
        <h2><span class="ic" v-html="icon('trophy')"></span> Pre-Season Tour</h2>
        <button class="btn small" @click="load">Refresh</button>
      </header>

      <div class="pre-card hero">
        <div class="hero-top">
          <span class="steps">{{ progress.cleared }} / {{ progress.total }}</span>
          <span class="chip">{{ tour.totalStars }}★</span>
        </div>
        <div class="bar"><i :style="{ width: `${Math.round(progress.pct * 100)}%` }"></i></div>
        <button
          v-if="nextStage"
          class="btn primary"
          :disabled="busy === `play-${nextStage.index}`"
          @click="play(nextStage.index)"
        >
          {{ busy === `play-${nextStage.index}` ? 'Playing…' : `Play stage ${nextStage.index} · ${nextStage.opponent}` }}
        </button>
        <p v-else class="note">The ladder is complete. Well played.</p>
      </div>

      <!-- The scripted first-session rail (P9 onboarding). -->
      <div class="pre-card">
        <div class="card-head">
          <h3>First session</h3>
          <span class="chip">{{ rail.done }} / {{ rail.total }}</span>
        </div>
        <ul class="pre-list">
          <li v-for="s in tour.onboarding" :key="s.id" class="pre-row" :class="{ done: s.done }">
            <span class="mark" v-html="icon(s.done ? 'check' : 'clock')"></span>
            <div class="row-body">
              <b>{{ s.title }}</b>
              <p class="note">{{ s.hint }}</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- The stage ladder. -->
      <div class="pre-card">
        <h3>Stages</h3>
        <ul class="pre-list">
          <li
            v-for="s in tour.stages"
            :key="s.index"
            class="pre-row stage"
            :class="{ done: s.cleared, locked: !s.unlocked }"
          >
            <span class="num">{{ s.index }}</span>
            <div class="row-body">
              <div class="row-top">
                <b>{{ s.opponent }}</b>
                <span class="stars">{{ s.bestStars }}★ / {{ s.requiredStars }}★</span>
              </div>
              <p class="note">Rating {{ s.rating }} · {{ s.attempts }} attempt{{ s.attempts === 1 ? '' : 's' }}</p>
              <div class="row-meta">
                <span v-if="!rewards(s).isEmpty" class="rewards">{{ rewards(s).summary }}</span>
                <button
                  v-if="stageAction(s) === 'play'"
                  class="btn tiny primary"
                  :disabled="busy === `play-${s.index}`"
                  @click="play(s.index)"
                >
                  {{ busy === `play-${s.index}` ? '…' : 'Play' }}
                </button>
                <button
                  v-else-if="stageAction(s) === 'claim'"
                  class="btn tiny primary"
                  :disabled="busy === `claim-${s.index}`"
                  @click="claim(s.index)"
                >
                  {{ busy === `claim-${s.index}` ? '…' : 'Claim' }}
                </button>
                <span v-else-if="stageAction(s) === 'claimed'" class="done">Claimed</span>
                <span v-else class="locked-tag">Locked</span>
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
import type {
  PreseasonClaimResult,
  PreseasonPlayResult,
  PreseasonProgress,
  PreseasonStage,
} from '@repo/api-contract';
import { client } from '@/services/api';
import { payloadOrNull } from '@/helpers/envelope';
import { currency } from '@/helpers/misc';
import {
  nextPlayable,
  onboardingProgress,
  rewardChips,
  stageAction,
  tourProgress,
} from '@/helpers/preseason-tour';
import { icon } from './icons';

/**
 * The Pre-Season Tour onboarding surface (docs/coc-mapping/02 §J, 08 §2 P9,
 * OW-N12): the fixed 10-stage AI ladder with `preseason.play` and
 * `preseason.claim`, plus the scripted first-session rail. The payload is fully
 * typed (`PreseasonProgressSchema`). Plain HTML/CSS + cozy tokens.
 */
const props = defineProps<{ clubId: string }>();
const emit = defineEmits<{ (e: 'toast', text: string, level?: 'success' | 'error'): void }>();

const tour = ref<PreseasonProgress | null>(null);
const loading = ref(false);
const error = ref('');
const busy = ref('');

const progress = computed(() =>
  tour.value ? tourProgress(tour.value) : { cleared: 0, total: 0, pct: 0 }
);
const rail = computed(() =>
  tour.value
    ? onboardingProgress(tour.value.onboarding)
    : { done: 0, total: 0, complete: false, pct: 0 }
);
const nextStage = computed(() =>
  tour.value ? nextPlayable(tour.value.stages) : null
);

function rewards(stage: PreseasonStage): { isEmpty: boolean; summary: string } {
  const chips = rewardChips(stage.reward);
  const parts: string[] = [];
  if (chips.cash) parts.push(currency(chips.cash));
  if (chips.fans) parts.push(`${Math.floor(chips.fans).toLocaleString('en-US')} Fans`);
  if (chips.scoutTokens) parts.push(`${chips.scoutTokens} tokens`);
  if (chips.sponsorCredits) parts.push(`${chips.sponsorCredits} credits`);
  return { isEmpty: chips.isEmpty, summary: parts.join(' · ') };
}

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  const res = await client.preseason.get.query({ params: { clubId: props.clubId } });
  const next = payloadOrNull<PreseasonProgress>(res);
  if (next) tour.value = next;
  else error.value = 'Could not load the Pre-Season Tour.';
  loading.value = false;
}

async function play(stage: number) {
  if (busy.value) return;
  busy.value = `play-${stage}`;
  const res = await client.preseason.play.mutation({
    params: { clubId: props.clubId },
    body: { stage },
  });
  const result = payloadOrNull<PreseasonPlayResult>(res);
  if (result) {
    tour.value = result.progress;
    emit(
      'toast',
      result.cleared
        ? `Stage ${stage} cleared ${result.score.you}–${result.score.them} (${result.stars}★).`
        : `Stage ${stage} not cleared (${result.score.you}–${result.score.them}).`,
      result.cleared ? 'success' : 'error'
    );
  } else {
    emit('toast', 'Could not play that stage.', 'error');
  }
  busy.value = '';
}

async function claim(stage: number) {
  if (busy.value) return;
  busy.value = `claim-${stage}`;
  const res = await client.preseason.claim.mutation({
    params: { clubId: props.clubId },
    body: { stage },
  });
  const result = payloadOrNull<PreseasonClaimResult>(res);
  if (result) {
    tour.value = result.progress;
    emit('toast', `Stage ${stage} reward claimed.`);
  } else {
    emit('toast', 'Could not claim that reward.', 'error');
  }
  busy.value = '';
}

onMounted(load);
</script>

<style scoped>
.pre {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink, #4a3220);
  font-family: 'Fredoka', system-ui, sans-serif;
}
.pre-state {
  padding: 20px;
  text-align: center;
}
.pre-state.bad {
  color: var(--red, #e5402f);
}
.pre-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pre-head h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
}
.pre-head .ic {
  width: 24px;
  height: 24px;
}
.pre-card {
  padding: 12px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pre-card.hero {
  background: linear-gradient(#e9f7e0, #d6f0c6);
}
.pre-card h3 {
  margin: 0;
  font-size: 16px;
}
.hero-top,
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.steps {
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
.bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(138, 90, 59, 0.15);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--green, #5cc23a), var(--gold, #f5b82e));
}
.pre-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pre-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 11px;
  background: #fffdf7;
  border: 2px solid #eadbb8;
}
.pre-row.done {
  border-color: #bfe3a5;
  background: #f6fdf1;
}
.pre-row.locked {
  opacity: 0.6;
}
.mark {
  width: 22px;
  height: 22px;
  flex: none;
  display: inline-flex;
}
.mark :deep(.ic) {
  width: 100%;
  height: 100%;
}
.num {
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(#fff8e6, #f1dfb6);
  border: 2px solid #e2cc9c;
  font-weight: 800;
  font-size: 13px;
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
.stars {
  font-size: 12px;
  font-weight: 700;
  color: #b8860b;
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
.rewards {
  font-weight: 700;
  color: var(--green-d, #2f8a1c);
}
.done {
  color: var(--green-d, #2f8a1c);
  font-weight: 700;
}
.locked-tag {
  font-weight: 700;
}
.note {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--muted, #6f5940);
}
.btn.tiny {
  padding: 2px 10px;
  font-size: 12px;
}
</style>
