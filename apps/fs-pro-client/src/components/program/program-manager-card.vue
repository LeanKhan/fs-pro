<template>
  <article class="op-mgr" :class="{ revealed: manager.interviewed, chosen: chosen }">
    <header class="op-mgr-head">
      <div class="op-mgr-face" aria-hidden="true">{{ initials }}</div>
      <div class="op-mgr-id">
        <b>{{ manager.firstName }} {{ manager.lastName }}</b>
        <span class="op-mgr-meta">Age {{ manager.age }}</span>
      </div>
      <span v-if="manager.interviewed" class="op-mgr-badge">Interviewed</span>
    </header>

    <div class="op-mgr-chips">
      <span v-if="manager.preferredFormation" class="op-chip">Formation {{ manager.preferredFormation }}</span>
      <span v-if="manager.preferredStyle" class="op-chip">Style {{ styleLabel }}</span>
      <span v-else class="op-chip muted">No set style</span>
    </div>

    <div class="op-mgr-overall">
      <div class="op-mgr-ova">
        <small>Overall</small>
        <b>{{ rangeLabel(manager.overall) }}</b>
      </div>
      <program-stars size="sm" :stars="expectedStars" />
    </div>

    <ul class="op-attrs">
      <li v-for="a in attributes" :key="a.label">
        <span class="op-attr-name">{{ a.label }}</span>
        <span class="op-attr-bar" aria-hidden="true">
          <i class="op-attr-fill" :style="{ left: `${a.low}%`, width: `${Math.max(3, a.high - a.low)}%` }" />
        </span>
        <span class="op-attr-val">{{ a.text }}</span>
      </li>
    </ul>

    <div v-if="manager.interviewed" class="op-mgr-trait">
      {{ traitNote }}
    </div>

    <footer class="op-mgr-foot">
      <div class="op-price">
        <span class="op-fee">{{ formatVilla(manager.effectiveFee) }}</span>
        <small>fee · {{ formatVilla(manager.wage) }}/yr</small>
        <em v-if="manager.interviewed && manager.signingFee !== manager.effectiveFee" class="op-discount">
          −10% negotiated
        </em>
      </div>
      <div class="op-mgr-actions">
        <button
          v-if="!manager.interviewed"
          class="op-btn ghost"
          :disabled="busy || budget < interviewFee"
          :title="budget < interviewFee ? 'Not enough for an interview' : 'Reveal the exact attributes'"
          @click="emit('interview', manager)"
        >
          Interview · {{ formatVilla(interviewFee) }}
        </button>
        <button
          class="op-btn primary"
          :disabled="busy || budget < manager.effectiveFee"
          :title="budget < manager.effectiveFee ? 'Not affordable' : 'Sign this manager'"
          @click="emit('sign', manager)"
        >
          Sign
        </button>
      </div>
    </footer>
    <p v-if="budget < manager.effectiveFee" class="op-mgr-warn">Out of reach at {{ formatVilla(budget) }}.</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatVilla, type ProgramManager } from '@repo/api-contract';
import ProgramStars from './program-stars.vue';
import { rangeLabel } from './program-lib';

const props = withDefaults(
  defineProps<{ manager: ProgramManager; budget: number; interviewFee: number; busy?: boolean; chosen?: boolean; startingBalance?: number }>(),
  { busy: false, chosen: false, startingBalance: 0 }
);
const emit = defineEmits<{ (e: 'interview', m: ProgramManager): void; (e: 'sign', m: ProgramManager): void }>();

const initials = computed(() => `${props.manager.firstName[0] ?? ''}${props.manager.lastName[0] ?? ''}`.toUpperCase());

const STYLE_LABELS: Record<string, string> = {
  possession: 'Possession',
  direct: 'Direct',
  counter: 'Counter',
  pressing: 'Pressing',
  balanced: 'Balanced',
  defensive: 'Defensive',
};
const styleLabel = computed(() => STYLE_LABELS[props.manager.preferredStyle ?? ''] ?? props.manager.preferredStyle ?? '');

const attributes = computed(() => [
  { label: 'Tactics', ...rangeView(props.manager.tactics.low, props.manager.tactics.high) },
  { label: 'Motivation', ...rangeView(props.manager.motivation.low, props.manager.motivation.high) },
  { label: 'Development', ...rangeView(props.manager.development.low, props.manager.development.high) },
  { label: 'Discipline', ...rangeView(props.manager.discipline.low, props.manager.discipline.high) },
]);

function rangeView(low: number, high: number) {
  return { low, high, text: low === high ? String(low) : `${low}–${high}` };
}

/** Spec §3.2 step 1: a rough read of the star band from what is known. */
const expectedStars = computed(() => {
  const m = props.manager;
  if (!m.interviewed) return m.overall.high >= 60 ? 2 : 1;
  const overall = m.overall.low;
  const feeShare = props.startingBalance > 0 ? m.effectiveFee / props.startingBalance : 0;
  if (overall >= 60 && feeShare <= 0.4 && props.startingBalance - m.effectiveFee >= 400_000) return 3;
  if (overall >= 55 || feeShare <= 0.4) return 2;
  return 1;
});

const traitNote = computed(() => {
  const m = props.manager;
  const best = [
    ['tactics', m.tactics.low],
    ['motivation', m.motivation.low],
    ['development', m.development.low],
    ['discipline', m.discipline.low],
  ].sort((a, b) => (b[1] as number) - (a[1] as number))[0][0];
  const notes: Record<string, string> = {
    tactics: 'A tactician: the brief is carried out exactly as you set it.',
    motivation: 'A man-manager: the dressing room plays for him.',
    development: 'A developer: young players grow under his eye.',
    discipline: 'A disciplinarian: fewer silly cards and fitter legs.',
  };
  return notes[best];
});
</script>

<style scoped>
.op-mgr {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 18px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  box-shadow: 0 3px 0 rgba(70, 40, 15, 0.18);
  transition: transform 0.12s, border-color 0.12s;
}
.op-mgr.revealed {
  border-color: #f0c56a;
  background: #fffdf3;
}
.op-mgr.chosen {
  border-color: #2f7d18;
  box-shadow: 0 0 0 3px rgba(63, 165, 38, 0.2);
}
.op-mgr-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.op-mgr-face {
  width: 46px;
  height: 46px;
  flex: none;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 18px;
  color: #fff;
  background: linear-gradient(#2f6fb0, #1f4f85);
  border: 3px solid #f3d27a;
}
.op-mgr-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.op-mgr-id b {
  font-size: 17px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.op-mgr-meta {
  font-size: 13px;
  color: #6f5940;
}
.op-mgr-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 9px;
  color: #fff;
  background: #1f4f85;
}
.op-mgr-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.op-chip {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 9px;
  background: #f6ead0;
  border: 2px solid #e2cc9c;
  color: #5e3b22;
}
.op-chip.muted {
  color: #6f5940;
  font-weight: 500;
}
.op-mgr-overall {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  background: #f6ead0;
}
.op-mgr-ova {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.op-mgr-ova small {
  font-size: 12px;
  color: #6f5940;
}
.op-mgr-ova b {
  font-size: 24px;
  color: #5e3b22;
  font-variant-numeric: tabular-nums;
}
.op-attrs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.op-attrs li {
  display: grid;
  grid-template-columns: 92px 1fr 52px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.op-attr-name {
  color: #6f5940;
}
.op-attr-bar {
  position: relative;
  height: 10px;
  border-radius: 6px;
  background: #ece0c4;
  overflow: hidden;
}
.op-attr-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 6px;
  background: linear-gradient(#8be15c, #46ad2a);
}
.op-attr-val {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.op-mgr-trait {
  font-size: 13px;
  font-style: italic;
  color: #1f4f85;
  background: #eaf3ff;
  border: 2px solid #cfe2fb;
  border-radius: 10px;
  padding: 6px 10px;
}
.op-mgr-foot {
  margin-top: auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
}
.op-price {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.op-fee {
  font-size: 20px;
  font-weight: 700;
  color: #5e3b22;
}
.op-price small {
  font-size: 12px;
  color: #6f5940;
}
.op-discount {
  font-size: 11px;
  color: #256b16;
  font-style: normal;
  font-weight: 700;
}
.op-mgr-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.op-btn {
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  padding: 8px 14px;
  border-radius: 12px;
  border: 3px solid #c39457;
  background: linear-gradient(#fffaf0, #ecdcb8);
  color: #5e3b22;
  box-shadow: 0 3px 0 rgba(70, 40, 15, 0.3);
  cursor: pointer;
  min-height: 44px;
}
.op-btn.primary {
  background: linear-gradient(#2f7d18, #24650f);
  border-color: #24650f;
  color: #fff;
}
.op-btn.ghost {
  background: #f6ead0;
}
.op-btn:disabled {
  filter: grayscale(0.7);
  opacity: 0.6;
  cursor: not-allowed;
}
.op-mgr-warn {
  margin: 0;
  font-size: 12px;
  color: #9a2216;
}
</style>
