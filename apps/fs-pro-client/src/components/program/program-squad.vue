<template>
  <section class="op-step">
    <header class="op-step-head">
      <div>
        <h2>Build the squad</h2>
        <p class="op-step-sub">Eleven bodies and a keeper before the gate opens. Scout before you sign — the range is not the truth.</p>
      </div>
      <div class="op-step-budget">
        <small>Budget left</small>
        <b>{{ formatVilla(budget) }}</b>
      </div>
    </header>

    <program-meter
      :manager="managerSigned"
      :players="squadCount"
      :gk="gkCount"
      :needed="market?.needed ?? 11"
    />

    <div class="op-tabs" role="tablist">
      <button class="op-tab" :class="{ on: tab === 'free' }" role="tab" :aria-selected="tab === 'free'" @click="tab = 'free'">
        Free agents
      </button>
      <button class="op-tab" :class="{ on: tab === 'transfer' }" role="tab" :aria-selected="tab === 'transfer'" @click="tab = 'transfer'">
        Transfer market
      </button>
    </div>

    <!-- Free agents -->
    <template v-if="tab === 'free'">
      <div class="op-controls">
        <label class="op-search">
          <span class="op-ic" v-html="icon('bag')" />
          <input v-model="query" type="search" placeholder="Search players" aria-label="Search free agents" />
        </label>
        <div class="op-posfilter" role="group" aria-label="Filter by position">
          <button v-for="p in positions" :key="p" class="op-sort" :class="{ on: pos === p }" @click="pos = p">
            {{ p }}
          </button>
        </div>
        <div class="op-sorts" role="group" aria-label="Sort players">
          <button v-for="s in sorts" :key="s.key" class="op-sort" :class="{ on: sort === s.key }" @click="sort = s.key">
            {{ s.label }}
          </button>
        </div>
      </div>

      <div v-if="freeAgents.length" class="op-list">
        <program-player-card
          v-for="p in freeAgents"
          :key="p.id"
          :name="`${p.firstName} ${p.lastName}`"
          :age="p.age"
          :position="p.position"
          :rating-label="rangeLabel(p.rating)"
          :rating-low="p.rating.low"
          :rating-high="p.rating.high"
          :value="p.value"
          :wage="p.wage"
          :scouted="p.scouted"
          :affordable="budget >= p.value"
          :busy="busy === `scout:${p.id}` || busy === `sign-player:${p.id}`"
          :scout-fee="market?.scoutFee ?? 0"
          :can-scout="budget >= (market?.scoutFee ?? 0)"
          source="free"
          @scout="emit('scout', p)"
          @sign="emit('sign', p)"
        />
      </div>
      <div v-else class="op-empty">
        <b>No players match.</b>
        <span>Clear the filter — the pool is deep and cheap bodies are always there.</span>
      </div>
    </template>

    <!-- Transfer market -->
    <template v-else>
      <p class="op-window" :class="{ open: transferWindow?.open }">
        <template v-if="transferWindow?.open">
          Transfer window open{{ transferWindow.daysLeft !== null ? ` · ${transferWindow.daysLeft} days left` : '' }}
        </template>
        <template v-else>Transfer window closed — free agents are the way in for now.</template>
      </p>
      <div v-if="otherPlayers.length" class="op-list">
        <program-player-card
          v-for="p in transferPlayers"
          :key="p._id"
          :name="`${p.FirstName} ${p.LastName}`"
          :age="p.Age"
          :position="p.Position"
          :rating-label="String(Math.round(p.Rating))"
          :rating-low="Math.max(0, p.Rating - 5)"
          :rating-high="Math.min(100, p.Rating + 5)"
          :value="p.Value"
          :wage="p.Wage ?? 0"
          :scouted="true"
          :affordable="budget >= p.Value && !!transferWindow?.open"
          :busy="busy === `buy:${p._id}`"
          :club-code="p.ClubCode ?? null"
          :listed="!!p.isTransferListed"
          source="transfer"
          @sign="emit('buy', p)"
        />
      </div>
      <div v-else class="op-empty">
        <b>Nobody listed right now.</b>
        <span>Sign free agents first; the market opens up as your club grows.</span>
      </div>
    </template>

    <div class="op-recover" :class="{ urgent: budget < 220_000 }">
      <div>
        <b>{{ budget < 220_000 ? 'Running thin.' : 'Need a cash buffer?' }}</b>
        <span>The board advance is a once-a-year recovery path, not a tap.</span>
      </div>
      <button class="op-btn ghost" :disabled="busy === 'loan'" @click="emit('advance')">Ask the board</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatVilla, type Player, type ProgramPlayer, type ProgramPlayerList, type TransferWindow } from '@repo/api-contract';
import { icon } from '@/components/cozy/icons';
import ProgramMeter from './program-meter.vue';
import ProgramPlayerCard from './program-player-card.vue';
import { playerSortValue, positionKind, rangeLabel, type SortKey } from './program-lib';

const props = defineProps<{
  market: ProgramPlayerList | null;
  budget: number;
  managerSigned: boolean;
  squadCount: number;
  gkCount: number;
  transferWindow: TransferWindow | null;
  otherPlayers: Player[];
  busy: string | null;
}>();
const emit = defineEmits<{
  (e: 'scout', p: ProgramPlayer): void;
  (e: 'sign', p: ProgramPlayer): void;
  (e: 'buy', p: Player): void;
  (e: 'advance'): void;
}>();

const tab = ref<'free' | 'transfer'>('free');
const query = ref('');
const pos = ref<'ALL' | 'GK' | 'DEF' | 'MID' | 'ATT'>('ALL');
const sort = ref<SortKey>('price');
const positions = ['ALL', 'GK', 'DEF', 'MID', 'ATT'] as const;
const sorts = [
  { key: 'price' as const, label: 'Cheapest' },
  { key: 'rating' as const, label: 'Best' },
  { key: 'age' as const, label: 'Youngest' },
];

const freeAgents = computed<ProgramPlayer[]>(() => {
  const q = query.value.trim().toLowerCase();
  const rows = (props.market?.players ?? []).filter((p) => {
    if (pos.value !== 'ALL' && positionKind(p.position).toUpperCase() !== pos.value) return false;
    if (!q) return true;
    return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q);
  });
  return rows.sort((a, b) => {
    const va = playerSortValue({ value: a.value, rating: a.rating, age: a.age }, sort.value);
    const vb = playerSortValue({ value: b.value, rating: b.rating, age: b.age }, sort.value);
    return sort.value === 'rating' ? vb - va : va - vb;
  });
});

const transferPlayers = computed(() =>
  [...props.otherPlayers].sort((a, b) => (b.Rating ?? 0) - (a.Rating ?? 0)).slice(0, 40)
);
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
  max-width: 560px;
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
.op-tabs {
  display: flex;
  gap: 6px;
}
.op-tab {
  font: inherit;
  font-weight: 700;
  font-size: 15px;
  padding: 9px 18px;
  border-radius: 12px;
  border: 3px solid #e2cc9c;
  background: #fffaf0;
  color: #5e3b22;
  cursor: pointer;
  min-height: 46px;
}
.op-tab.on {
  background: linear-gradient(#2f7d18, #24650f);
  border-color: #24650f;
  color: #fff;
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
  flex: 1 1 180px;
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
.op-posfilter,
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
.op-list {
  display: grid;
  gap: 8px;
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
.op-window {
  margin: 0;
  padding: 9px 14px;
  border-radius: 12px;
  background: #fde6e1;
  border: 2px solid #f2b5ab;
  color: #9a2216;
  font-weight: 600;
  font-size: 14px;
}
.op-window.open {
  background: #eaf8e0;
  border-color: #bfe3a5;
  color: #256b16;
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
.op-btn:disabled {
  filter: grayscale(0.7);
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
