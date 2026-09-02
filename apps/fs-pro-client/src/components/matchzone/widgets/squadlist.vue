<template>
  <v-list density="compact" lines="two">
    <squad-player
      v-for="(player, i) in sortedSquad"
      :key="player._id || i"
      :player="player"
      :matchFinished="matchFinished"
    ></squad-player>
  </v-list>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import SquadPlayer from './squadlist-player.vue';

interface Props {
  squad: any[];
  matchFinished?: any;
}

const props = withDefaults(defineProps<Props>(), {
  matchFinished: false,
});

defineOptions({
  name: 'SquadList',
});

const sortedSquad = computed(() => {
  return [...props.squad].sort();
});
</script>
