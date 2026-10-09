<template>
  <section class="op-step">
    <header class="op-step-head">
      <div>
        <h2>Build the foundations</h2>
        <p class="op-step-sub">
          One Tier&nbsp;1 goes up now. Choose what compounds: training, gate income, or recovery.
        </p>
      </div>
      <div class="op-step-budget">
        <small>Budget</small>
        <b>{{ formatVilla(budget) }}</b>
      </div>
    </header>

    <p class="op-star-hint">
      <span class="op-ic" v-html="icon('star')" />
      <span
        >★★★ wants a Tier&nbsp;1 from <b>Training Ground</b>, <b>Stands</b> or <b>Medical Centre</b>, and
        <b>{{ formatVilla(200_000) }}</b> still in the bank.</span
      >
    </p>

    <div class="op-fac-grid">
      <article v-for="a in assets" :key="a.type" class="op-fac" :class="{ recommended: recommended(a.type), built: a.level >= 1 }">
        <header>
          <span class="op-fac-ic"><span v-html="icon('hammer')" /></span>
          <div class="op-fac-name">
            <b>{{ a.name }}</b>
            <span class="op-tier">{{ a.level >= 1 ? `Tier ${a.level}` : 'Not built' }}</span>
          </div>
          <span v-if="recommended(a.type)" class="op-rec">Recommended</span>
        </header>
        <p class="op-fac-desc">{{ a.description }}</p>
        <p class="op-fac-effect">{{ tierWording(a.effectLabel) }}</p>

        <div v-if="a.upgrade" class="op-fac-building">
          <span class="op-spinner" aria-hidden="true" />
          Building Tier {{ a.upgrade.toLevel }} — done shortly
        </div>
        <template v-else-if="a.level >= 1">
          <div class="op-fac-done"><span v-html="icon('check')" /> Tier {{ a.level }} complete</div>
          <p v-if="a.next" class="op-fac-next">Next: Tier {{ a.next.level }} · {{ formatVilla(a.next.cost) }}</p>
        </template>
        <template v-else-if="a.next">
          <div class="op-fac-cost">
            <span>{{ formatVilla(a.next.cost) }}</span>
            <small>Tier 1 · {{ a.next.minutes }} min</small>
          </div>
          <button
            class="op-btn primary"
            :disabled="busy === `build:${a.type}` || !!a.next.blockedReason || budget < a.next.cost"
            :title="a.next.blockedReason ?? (budget < a.next.cost ? 'Not affordable yet' : 'Start the build')"
            @click="emit('build', a.type)"
          >
            {{ busy === `build:${a.type}` ? 'Starting…' : 'Build Tier 1' }}
          </button>
          <p v-if="a.next.blockedReason" class="op-fac-blocked">{{ a.next.blockedReason }}</p>
        </template>
      </article>
    </div>

    <div class="op-recover" :class="{ urgent: budget < 200_000 }">
      <div>
        <b>{{ budget < 200_000 ? 'Too dear this month?' : 'Play while the builders work.' }}</b>
        <span>Qualifying friendlies pay gate money — bank a few, then build. The cheapest Tier 1 still counts.</span>
      </div>
      <button class="op-btn ghost" :disabled="busy === 'loan'" @click="emit('advance')">Ask the board</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AssetState, Campus } from '@repo/api-contract';
import { formatVilla } from '@repo/api-contract';
import { icon } from '@/components/cozy/icons';
import { tierWording } from './program-lib';

const props = defineProps<{ campus: Campus | null; budget: number; busy: string | null }>();
const emit = defineEmits<{ (e: 'build', type: string): void; (e: 'advance'): void }>();

const RECOMMENDED = ['training_ground', 'stands', 'medical_centre'];
function recommended(type: string): boolean {
  return RECOMMENDED.includes(type);
}

const assets = computed<AssetState[]>(() => {
  const list = [...(props.campus?.assets ?? [])];
  return list.sort((a, b) => {
    const ra = recommended(a.type) ? 0 : 1;
    const rb = recommended(b.type) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (a.next?.cost ?? 0) - (b.next?.cost ?? 0);
  });
});
</script>

<style scoped>
.op-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.op-step-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.op-step-head h2 {
  margin: 0;
  font-size: 24px;
}
.op-step-sub {
  margin: 2px 0 0;
  font-size: 14px;
  color: #6f5940;
  max-width: 620px;
}
.op-step-budget {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 6px 14px;
  border-radius: 12px;
  background: #f6ead0;
  border: 2px solid #e2cc9c;
}
.op-step-budget small {
  font-size: 11px;
  color: #6f5940;
}
.op-step-budget b {
  font-size: 20px;
  color: #256b16;
}
.op-star-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-radius: 12px;
  background: #fff7dc;
  border: 2px solid #f0d48a;
  font-size: 13px;
  color: #6f5010;
}
.op-star-hint .op-ic {
  width: 20px;
  height: 20px;
  flex: none;
}
.op-fac-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.op-fac {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  box-shadow: 0 3px 0 rgba(70, 40, 15, 0.18);
}
.op-fac.recommended {
  border-color: #f0c56a;
  background: #fffdf3;
}
.op-fac.built {
  background: #f1fae6;
  border-color: #bfe3a5;
}
.op-fac header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.op-fac-ic {
  width: 42px;
  height: 42px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #f6ead0;
  border: 2px solid #e2cc9c;
}
.op-fac-ic :deep(svg) {
  width: 26px;
  height: 26px;
}
.op-fac-name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.op-fac-name b {
  font-size: 16px;
}
.op-tier {
  font-size: 12px;
  font-weight: 700;
  color: #8a6230;
}
.op-rec {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: #fff;
  background: #f08a1c;
  border-radius: 8px;
  padding: 3px 7px;
}
.op-fac-desc {
  margin: 0;
  font-size: 13px;
  color: #6f5940;
}
.op-fac-effect {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #256b16;
}
.op-fac-cost {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 4px;
}
.op-fac-cost span {
  font-size: 20px;
  font-weight: 700;
  color: #5e3b22;
}
.op-fac-cost small {
  font-size: 12px;
  color: #6f5940;
}
.op-fac-done {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: #256b16;
}
.op-fac-done :deep(svg) {
  width: 20px;
  height: 20px;
}
.op-fac-next {
  margin: 0;
  font-size: 12px;
  color: #6f5940;
}
.op-fac-building {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1f4f85;
  font-size: 14px;
}
.op-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 3px solid #cfe2fb;
  border-top-color: #1f4f85;
  animation: op-spin 0.9s linear infinite;
}
@keyframes op-spin {
  to {
    transform: rotate(360deg);
  }
}
.op-fac-blocked {
  margin: 0;
  font-size: 12px;
  color: #9a2216;
}
.op-btn {
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  padding: 9px 16px;
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
.op-btn:disabled {
  filter: grayscale(0.7);
  opacity: 0.6;
  cursor: not-allowed;
}
.op-recover {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
  flex-wrap: wrap;
}
.op-recover.urgent {
  background: #fde6e1;
  border-color: #f2b5ab;
}
.op-recover b {
  display: block;
  font-size: 15px;
}
.op-recover span {
  font-size: 13px;
  color: #6f5940;
}
@media (max-width: 760px) {
  .op-fac-grid {
    grid-template-columns: 1fr;
  }
}
</style>
