<template>
  <v-dialog v-model="show" max-width="440" persistent>
    <v-card v-if="result" class="rewards-dialog pa-5 rounded-2xl text-center">
      <!-- Outcome Banner -->
      <div class="outcome-badge-wrap my-2">
        <span
          class="outcome-banner px-6 py-1.5 rounded-pill font-weight-black text-uppercase"
          :class="result.outcome"
        >
          {{ result.outcome === 'win' ? '🏆 VICTORY' : result.outcome === 'loss' ? 'DEFEAT' : 'STALEMATE (DRAW)' }}
        </span>
      </div>

      <!-- Matchup & Score -->
      <div class="text-caption text-medium-emphasis mt-2">
        {{ myClubName }} vs {{ result.opponent.name }}
      </div>
      <div class="score-display font-weight-black my-2">
        {{ result.score.you }} - {{ result.score.them }}
      </div>
      <div class="text-caption text-medium-emphasis mb-4">
        Power {{ myPower }} vs {{ result.opponent.power }}
      </div>

      <!-- Loot Box Breakdown -->
      <div class="loot-card pa-3 rounded-xl mb-3 text-left">
        <div class="text-caption font-weight-bold text-amber mb-2">LOOT & REWARDS</div>

        <div class="d-flex justify-space-between align-center mb-1.5 text-body-2">
          <span class="text-medium-emphasis">Match Reward:</span>
          <span class="font-weight-bold text-success">+{{ formatCurrency(result.rewards.cash) }}</span>
        </div>

        <div v-if="result.gate" class="d-flex justify-space-between align-center mb-1.5 text-body-2">
          <span class="text-medium-emphasis">
            Stadium Gate ({{ result.gate.attendance.toLocaleString() }} fans):
          </span>
          <span class="font-weight-bold text-teal-lighten-2">+{{ formatCurrency(result.gate.net) }}</span>
        </div>

        <div class="d-flex justify-space-between align-center text-body-2 pt-1.5 border-top">
          <span class="text-medium-emphasis">Club XP Earned:</span>
          <span class="font-weight-bold text-amber">+{{ result.rewards.xp }} XP</span>
        </div>
      </div>

      <!-- XP Bar to next level -->
      <div v-if="result.state" class="xp-bar-box pa-3 rounded-xl mb-3 text-left">
        <div class="d-flex justify-space-between text-caption font-weight-bold mb-1">
          <span>Club Level {{ result.state.club.level }}</span>
          <span class="text-amber">{{ result.state.club.xpIntoLevel }} / {{ result.state.club.xpForNext }} XP</span>
        </div>
        <v-progress-linear
          :model-value="xpPercent"
          color="amber"
          bg-color="grey-darken-3"
          height="8"
          rounded
        ></v-progress-linear>
      </div>

      <!-- Challenge Completed Alert -->
      <v-alert
        v-if="result.challengeCompleted"
        type="success"
        variant="tonal"
        density="compact"
        class="mb-3 rounded-xl"
      >
        🎯 Challenge Objective Completed! Extra bonus claimed!
      </v-alert>

      <v-btn
        block
        size="large"
        color="amber-darken-2"
        variant="flat"
        class="font-weight-bold mt-2"
        @click="show = false"
      >
        Collect & Continue
      </v-btn>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MatchResult } from '@repo/api-contract';
import { currency } from '@/helpers/misc';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    result?: MatchResult | null;
    myClubName?: string;
    myPower?: number;
  }>(),
  {
    modelValue: false,
    result: null,
    myClubName: 'Segun FC',
    myPower: 180,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const show = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const formatCurrency = (val: number) => currency(val);

const xpPercent = computed(() => {
  if (!props.result?.state) return 0;
  const c = props.result.state.club;
  return Math.min(100, (c.xpIntoLevel / c.xpForNext) * 100);
});
</script>

<style scoped>
.rewards-dialog {
  background: rgba(15, 23, 42, 0.96) !important;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(16px);
}

.outcome-banner {
  font-size: 1rem;
  letter-spacing: 0.08em;
  display: inline-block;
}

.outcome-banner.win {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
}

.outcome-banner.draw {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
}

.outcome-banner.loss {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #ffffff;
}

.score-display {
  font-size: 2.8rem;
  letter-spacing: 0.04em;
  color: #ffffff;
  line-height: 1;
}

.loot-card,
.xp-bar-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.border-top {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
