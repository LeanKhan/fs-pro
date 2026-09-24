<template>
  <v-card class="next-goal-card pa-3 border" rounded="lg" :style="glassStyle">
    <div class="d-flex justify-space-between align-center mb-1">
      <span class="text-caption font-weight-bold text-white text-uppercase d-flex align-center gap-1">
        <v-icon size="14" color="amber">mdi-target</v-icon> Next Goal
      </span>
      <v-chip v-if="secondsLeft > 0" size="x-small" color="amber" variant="tonal" class="font-weight-bold">
        {{ formatClock(secondsLeft) }}
      </v-chip>
    </div>

    <div class="text-caption font-weight-medium text-white my-2">{{ title }}</div>

    <div class="d-flex justify-end text-caption text-medium-emphasis mb-1">{{ currentWins }}/{{ targetWins }}</div>
    <v-progress-linear
      :model-value="progressPercent"
      color="amber"
      bg-color="rgba(255,255,255,0.1)"
      height="6"
      rounded
      class="mb-2"
    ></v-progress-linear>

    <div class="d-flex align-center gap-2 text-caption pt-2" style="border-top: 1px solid rgba(255, 255, 255, 0.08)">
      <span class="text-medium-emphasis">Reward:</span>
      <span class="text-success font-weight-bold">{{ formatCurrency(rewardCash) }}</span>
      <template v-if="rewardFans">
        <span class="text-medium-emphasis">+</span>
        <span class="text-info font-weight-bold">{{ rewardFans }} Fans</span>
      </template>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { currency } from '@/helpers/misc';

const props = withDefaults(
  defineProps<{
    title?: string;
    targetWins?: number;
    currentWins?: number;
    rewardCash?: number;
    rewardFans?: number;
    secondsLeft?: number;
  }>(),
  { title: 'Win 3 matches in 7 days', targetWins: 3, currentWins: 0, rewardCash: 25000, rewardFans: 150, secondsLeft: 0 }
);

const progressPercent = computed(() => (props.targetWins ? Math.min(100, (props.currentWins / props.targetWins) * 100) : 0));
const formatCurrency = (val: number) => currency(val);
const glassStyle = {
  background: 'linear-gradient(135deg, rgba(30, 34, 53, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
  borderColor: 'rgba(99, 102, 241, 0.3)',
  width: '220px',
};

function formatClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
</script>

<style scoped>
.next-goal-card {
  pointer-events: auto;
}
</style>
