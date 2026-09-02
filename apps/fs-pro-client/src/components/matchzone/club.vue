<template>
  <div class="club-widget" :class="{ home: isHome, away: !isHome }">
    <div class="club-name">
      {{ clubName }}
      <b>{{ clubCode }}</b>
    </div>

    <div class="club-badge-wrap">
      <span v-if="winner === side" class="trophy" title="Winner">🏆</span>
      <img class="club-badge" :src="`/club-icons/${clubCode}.svg`" />
    </div>

    <div class="club-rating">★ {{ roundTo(clubRating, 1) }}</div>

    <div v-if="clubStandings?.standing" class="club-standing">
      {{ ordinal(clubStandings.position) }} -
      {{ clubStandings.standing.Points }} Pts
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ordinal, roundTo } from '@/helpers/misc';

interface Props {
  clubName: any;
  isHome: any;
  rating: any;
  clubCode: any;
  clubStandings?: any;
  winner?: string;
}

const props = defineProps<Props>();

defineOptions({
  name: 'MatchClub',
});

const clubRating = computed(() => {
  if (props.rating) {
    return Math.round(props.rating) / 20;
  } else {
    return 0;
  }
});

const side = computed(() => {
  return props.isHome ? 'home' : 'away';
});
</script>

<style scoped>
.club-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  min-width: 0;
}
.club-name {
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}
.club-badge-wrap {
  position: relative;
  margin: 2px 0;
}
.club-badge {
  width: 32px;
  height: 32px;
}
.trophy {
  position: absolute;
  top: -8px;
  right: -8px;
  font-size: 12px;
}
.club-rating {
  color: #e9b34a;
  font-size: 10px;
}
.club-standing {
  opacity: 0.6;
  font-size: 9px;
}
</style>
