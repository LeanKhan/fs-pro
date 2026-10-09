<template>
  <section class="op-step">
    <header class="op-step-head">
      <div>
        <h2>Sign a manager</h2>
        <p class="op-step-sub">
          Fee, wage and fit. Watch the style — your brief only works if it fits.
        </p>
      </div>
      <div class="op-step-budget">
        <small>Budget</small>
        <b>{{ formatVilla(budget) }}</b>
      </div>
    </header>

    <div class="op-controls">
      <label class="op-search">
        <span class="op-ic" v-html="icon('bag')" />
        <input
          v-model="query"
          type="search"
          placeholder="Search managers"
          aria-label="Search managers"
        />
      </label>
      <div class="op-sorts" role="group" aria-label="Sort managers">
        <button
          v-for="s in sorts"
          :key="s.key"
          class="op-sort"
          :class="{ on: sort === s.key }"
          @click="sort = s.key"
        >
          {{ s.label }}
        </button>
      </div>
      <label class="op-afford">
        <input v-model="onlyAffordable" type="checkbox" />
        <span>Affordable only</span>
      </label>
    </div>

    <p class="op-star-hint">
      <span class="op-ic" v-html="icon('star')" />
      <span>
        Your board wants
        <b>Overall 60+</b>
        , a fee under 40% of your opening balance, and
        <b>{{ formatVilla(400_000) }}</b>
        left afterwards.
      </span>
    </p>

    <div v-if="list.length" class="op-mgr-grid">
      <program-manager-card
        v-for="m in list"
        :key="m.id"
        :manager="m"
        :budget="budget"
        :interview-fee="interviewFee"
        :starting-balance="startingBalance"
        :busy="busy === `interview:${m.id}` || busy === `sign-manager:${m.id}`"
        :chosen="pending?.id === m.id"
        @interview="emit('interview', $event)"
        @sign="openNegotiation"
      />
    </div>
    <div v-else class="op-empty">
      <b>No managers match.</b>
      <span>Widen the search or clear the filter — the pool is deep.</span>
    </div>

    <!-- Negotiate + sign -->
    <div
      v-if="pending"
      class="op-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Negotiate and sign"
    >
      <div class="op-modal-backdrop" @click="pending = null" />
      <div class="op-modal-card">
        <h3>Negotiate &amp; sign</h3>
        <p class="op-modal-who">
          {{ pending.firstName }} {{ pending.lastName }}
        </p>
        <dl class="op-modal-rows">
          <div>
            <dt>Signing fee</dt>
            <dd>{{ formatVilla(pending.effectiveFee) }}</dd>
          </div>
          <div>
            <dt>Wage</dt>
            <dd>{{ formatVilla(pending.wage) }} / year</dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>
              <span class="op-years" role="group" aria-label="Contract years">
                <button
                  v-for="y in [1, 2, 3, 4, 5]"
                  :key="y"
                  class="op-year"
                  :class="{ on: years === y }"
                  @click="years = y"
                >
                  {{ y }}
                </button>
              </span>
              <span class="op-years-unit">
                year{{ years === 1 ? '' : 's' }}
              </span>
            </dd>
          </div>
          <div>
            <dt>Total commitment</dt>
            <dd>
              {{ formatVilla(pending.effectiveFee + pending.wage * years) }}
            </dd>
          </div>
          <div>
            <dt>Budget after signing fee</dt>
            <dd :class="{ bad: budget - pending.effectiveFee < 0 }">
              {{ formatVilla(budget - pending.effectiveFee) }}
            </dd>
          </div>
        </dl>
        <p v-if="pending.interviewed" class="op-modal-good">
          You interviewed him — the fee is already down 10%.
        </p>
        <p v-else class="op-modal-warn">
          You haven't interviewed him. The attributes are still a range; signing
          now is a gamble.
        </p>
        <div class="op-modal-actions">
          <button class="op-btn ghost" @click="pending = null">Not yet</button>
          <button
            class="op-btn primary"
            :disabled="budget < pending.effectiveFee"
            @click="confirmSign"
          >
            Sign for {{ formatVilla(pending.effectiveFee) }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  formatVilla,
  type ProgramManager,
  type ProgramManagerList,
} from '@repo/api-contract';
import { icon } from '@/components/cozy/icons';
import ProgramManagerCard from './program-manager-card.vue';
import { rangeMid } from './program-lib';

const props = defineProps<{
  list: ProgramManagerList;
  budget: number;
  startingBalance: number;
  busy: string | null;
}>();
const emit = defineEmits<{
  (e: 'interview', m: ProgramManager): void;
  (e: 'confirmSign', m: ProgramManager, years: number): void;
}>();

const query = ref('');
const sort = ref<'fee' | 'overall' | 'age'>('fee');
const onlyAffordable = ref(false);
const pending = ref<ProgramManager | null>(null);
const years = ref(3);

const sorts = [
  { key: 'fee' as const, label: 'Cheapest' },
  { key: 'overall' as const, label: 'Best rated' },
  { key: 'age' as const, label: 'Youngest' },
];

const interviewFee = computed(() => props.list.interviewFee);

const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  const rows = props.list.managers.filter((m) => {
    if (onlyAffordable.value && m.effectiveFee > props.budget) return false;
    if (!q) return true;
    return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q);
  });
  return rows.sort((a, b) => {
    if (sort.value === 'fee') return a.effectiveFee - b.effectiveFee;
    if (sort.value === 'age') return a.age - b.age;
    return rangeMid(b.overall) - rangeMid(a.overall);
  });
});

function openNegotiation(m: ProgramManager) {
  pending.value = m;
  years.value = 3;
}

function confirmSign() {
  if (!pending.value) return;
  emit('confirmSign', pending.value, years.value);
  pending.value = null;
}
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
.op-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.op-search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 200px;
  padding: 4px 10px;
  border-radius: 12px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
}
.op-search .op-ic {
  width: 20px;
  height: 20px;
  opacity: 0.6;
}
.op-search input {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 15px;
  border: 0;
  background: none;
  outline: none;
  color: #4a3220;
  padding: 6px 2px;
}
.op-sorts {
  display: flex;
  gap: 4px;
}
.op-sort {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 10px;
  border: 2px solid #e2cc9c;
  background: #fffaf0;
  color: #5e3b22;
  cursor: pointer;
  min-height: 44px;
}
.op-sort.on {
  background: #2f7d18;
  border-color: #24650f;
  color: #fff;
}
.op-afford {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #6f5940;
  min-height: 44px;
}
.op-afford input {
  width: 18px;
  height: 18px;
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
.op-mgr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.op-empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 24px;
  text-align: center;
  color: #6f5940;
  border: 3px dashed #d8c49a;
  border-radius: 16px;
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
.op-modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
}
.op-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(40, 25, 10, 0.5);
}
.op-modal-card {
  position: relative;
  width: min(440px, calc(100vw - 32px));
  padding: 20px;
  border-radius: 20px;
  background: #fdf4df;
  border: 4px solid #c9a46a;
  box-shadow: 0 8px 24px rgba(40, 25, 10, 0.35);
}
.op-modal-card h3 {
  margin: 0;
  font-size: 22px;
}
.op-modal-who {
  margin: 2px 0 12px;
  font-weight: 600;
  color: #1f4f85;
}
.op-modal-rows {
  margin: 0;
  display: grid;
  gap: 8px;
}
.op-modal-rows > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 2px dashed #e2cc9c;
}
.op-modal-rows dt {
  color: #6f5940;
  font-size: 14px;
}
.op-modal-rows dd {
  margin: 0;
  font-weight: 700;
  color: #5e3b22;
}
.op-modal-rows dd.bad {
  color: #9a2216;
}
.op-years {
  display: inline-flex;
  gap: 4px;
}
.op-year {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 2px solid #c9a46a;
  background: #fffaf0;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.op-year.on {
  background: #2f7d18;
  border-color: #24650f;
  color: #fff;
}
.op-years-unit {
  margin-left: 6px;
  font-weight: 600;
  color: #6f5940;
}
.op-modal-good {
  margin: 12px 0 0;
  font-size: 13px;
  color: #256b16;
}
.op-modal-warn {
  margin: 12px 0 0;
  font-size: 13px;
  color: #9a6a16;
}
.op-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
@media (max-width: 760px) {
  .op-mgr-grid {
    grid-template-columns: 1fr;
  }
}
</style>
