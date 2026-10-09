<template>
  <section class="op-balance">
    <div class="op-balance-crest" aria-hidden="true">
      <span>{{ initials }}</span>
    </div>
    <p class="op-balance-kicker">
      {{ clubName }} · the board's opening balance
    </p>
    <div class="op-balance-figure">
      <program-count-up
        :value="balance"
        :duration="1200"
        :format="formatVilla"
        class="op-balance-amount"
      />
    </div>
    <div class="op-coin-row" aria-hidden="true">
      <span
        v-for="i in 7"
        :key="i"
        class="op-coin"
        :style="{ animationDelay: `${i * 90}ms` }"
        v-html="icon('coins')"
      />
    </div>
    <p class="op-balance-line">{{ line }}</p>

    <div class="op-buys">
      <div class="op-buy">
        <span class="op-buy-ic" v-html="icon('people')" />
        <b>A manager</b>
        <small>from {{ formatVilla(40_000) }}</small>
      </div>
      <div class="op-buy">
        <span class="op-buy-ic" v-html="icon('bag')" />
        <b>Eleven players</b>
        <small>from {{ formatVilla(220_000) }}</small>
      </div>
      <div class="op-buy">
        <span class="op-buy-ic" v-html="icon('hammer')" />
        <b>One Tier-1 building</b>
        <small>from {{ formatVilla(200_000) }}</small>
      </div>
    </div>

    <div class="op-balance-foot">
      <!-- The three "from" costs are ~10% of the opening balance, so the old
           "funds can't do all three" claim contradicted the numbers on the
           same screen (U-20 / P03-03, P07-17). -->
      <p class="op-balance-hint">
        Spend it across the manager, the squad and the buildings — the club
        grows from here.
      </p>
      <button class="op-btn primary big" @click="emit('begin')">
        Right then — start the program
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { formatVilla } from '@repo/api-contract';
import { icon } from '@/components/cozy/icons';
import { sfx } from '@/services/sfx';
import ProgramCountUp from './program-count-up.vue';

const props = defineProps<{
  balance: number;
  clubName: string;
  clubCode?: string;
}>();
const emit = defineEmits<{ (e: 'begin'): void }>();

const initials = computed(() =>
  (props.clubCode || props.clubName || 'FC').slice(0, 3).toUpperCase()
);

const line = computed(() => {
  if (props.balance <= 1_500_000) {
    return 'Enough for a manager, a hard-working squad and one good building — not all three done well. Choose.';
  }
  if (props.balance < 4_000_000) {
    return 'You can have two of the three done well. The third decides your season.';
  }
  return "The best draw on the board. Spend it like it's the last money you'll see — the league won't be gentle.";
});

onMounted(() => {
  const reduce = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  sfx.play('coin');
  if (!reduce) window.setTimeout(() => sfx.play('collect'), 500);
});
</script>

<style scoped>
.op-balance {
  text-align: center;
  padding: 18px 16px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.op-balance-crest {
  width: 84px;
  height: 92px;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 26px;
  color: #fff;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.3);
  background: linear-gradient(#2f6fb0, #1f4f85);
  border: 4px solid #f3d27a;
  border-radius: 16px 16px 24px 24px;
  box-shadow: 0 4px 0 rgba(70, 40, 15, 0.3);
}
.op-balance-kicker {
  margin: 12px 0 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #8a6230;
}
.op-balance-figure {
  margin: 2px 0 0;
}
.op-balance-amount {
  display: inline-block;
  font-size: clamp(48px, 12vw, 88px);
  line-height: 1;
  color: #256b16;
  text-shadow: 0 3px 0 rgba(47, 138, 28, 0.22);
}
.op-coin-row {
  display: flex;
  gap: 4px;
  margin: 8px 0 2px;
}
.op-coin {
  width: 26px;
  height: 26px;
  animation: op-pop 0.5s ease-out both;
}
.op-coin :deep(svg) {
  width: 100%;
  height: 100%;
}
@keyframes op-pop {
  from {
    transform: translateY(-24px) scale(0.4);
    opacity: 0;
  }
}
.op-balance-line {
  max-width: 540px;
  margin: 8px auto 0;
  font-size: 17px;
  line-height: 1.4;
  color: #4a3220;
}
.op-buys {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  max-width: 560px;
  margin: 18px auto 0;
}
.op-buy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  border-radius: 14px;
  background: #fffaf0;
  border: 3px solid #e2cc9c;
}
.op-buy-ic {
  width: 34px;
  height: 34px;
}
.op-buy-ic :deep(svg) {
  width: 100%;
  height: 100%;
}
.op-buy b {
  font-size: 14px;
}
.op-buy small {
  font-size: 12px;
  color: #6f5940;
}
.op-balance-foot {
  margin-top: 18px;
  width: 100%;
  max-width: 560px;
}
.op-balance-hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: #6f5940;
}
.op-btn {
  font: inherit;
  font-weight: 700;
  padding: 10px 18px;
  border-radius: 14px;
  border: 3px solid #c39457;
  background: linear-gradient(#fffaf0, #ecdcb8);
  color: #5e3b22;
  box-shadow: 0 3px 0 rgba(70, 40, 15, 0.3);
  cursor: pointer;
  min-height: 48px;
}
.op-btn.primary {
  background: linear-gradient(#2f7d18, #24650f);
  border-color: #24650f;
  color: #fff;
}
.op-btn.big {
  font-size: 18px;
  padding: 14px 26px;
}
.op-btn:active {
  transform: translateY(2px);
}
@media (max-width: 760px) {
  .op-buys {
    grid-template-columns: 1fr;
  }
}
</style>
