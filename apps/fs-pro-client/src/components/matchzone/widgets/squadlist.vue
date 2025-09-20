<template>
  <v-list dense two-line>
    <squad-player
      v-for="(player, i) in squad"
      :key="i"
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

const list = computed(() => {
  return props.squad.sort();
});
</script>
