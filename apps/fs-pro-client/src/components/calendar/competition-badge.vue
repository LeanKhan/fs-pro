<template>
  <v-chip
    :size="size"
    :color="style.color"
    variant="tonal"
    class="competition-badge font-weight-bold"
    :title="`${style.label}${round ? ' - ' + round : ''}`"
  >
    <v-icon start size="x-small">{{ style.icon }}</v-icon>
    {{ style.code }}<template v-if="showRound && round"> &bull; {{ round }}</template>
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { competitionStyle, fixtureRound } from '@/utils/competitionStyle';

const props = withDefaults(
  defineProps<{
    fixture: {
      LeagueCode?: string | null;
      Type?: string | null;
      Stage?: string | null;
      Week?: number | null;
    };
    /** Append the round/group (cups) or matchweek (leagues). */
    showRound?: boolean;
    size?: 'x-small' | 'small';
  }>(),
  { showRound: false, size: 'x-small' }
);

const style = computed(() => competitionStyle(props.fixture));
const round = computed(() => fixtureRound(props.fixture));
</script>
