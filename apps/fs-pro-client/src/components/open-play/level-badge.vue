<template>
  <v-tooltip location="bottom" :text="tooltip">
    <template #activator="{ props: tip }">
      <div v-bind="tip" class="level-badge d-inline-flex align-center">
        <v-progress-circular :model-value="progress" :size="size" :width="3" color="amber" bg-color="rgba(255,255,255,.15)">
          <span class="level-num font-weight-black">{{ level }}</span>
        </v-progress-circular>
        <v-icon v-if="lastChange === 1" color="green" size="16" class="ml-n1">mdi-arrow-up-bold</v-icon>
        <v-icon v-else-if="lastChange === -1" color="red" size="16" class="ml-n1">mdi-arrow-down-bold</v-icon>
        <span v-if="showLabel" class="ml-2 text-caption font-weight-bold">Level {{ level }}</span>
      </div>
    </template>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { levelForXp, xpForLevel } from '@/helpers/open-play';

/** A club's Level (from XP) with a ring showing progress to the next one. */
const props = withDefaults(
  defineProps<{
    xp: number;
    thresholds?: number[] | null;
    lastChange?: 1 | -1 | 0;
    size?: number;
    showLabel?: boolean;
  }>(),
  { thresholds: null, lastChange: 0, size: 34, showLabel: false }
);

const level = computed(() => levelForXp(props.xp, props.thresholds));
const progress = computed(() => {
  const from = xpForLevel(level.value, props.thresholds);
  const to = xpForLevel(level.value + 1, props.thresholds);
  return to > from ? Math.round(((props.xp - from) / (to - from)) * 100) : 100;
});
const tooltip = computed(() => {
  const next = xpForLevel(level.value + 1, props.thresholds);
  return `Level ${level.value} · ${props.xp.toLocaleString()} XP · ${Math.max(0, next - props.xp).toLocaleString()} XP to Level ${level.value + 1}`;
});
</script>

<style scoped>
.level-num {
  font-size: 0.8rem;
}
</style>
