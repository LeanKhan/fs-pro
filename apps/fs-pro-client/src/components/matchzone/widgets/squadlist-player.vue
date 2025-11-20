<template>
  <v-list-item
    style="min-height: 30px !important; height: 40px !important"
    density="compact"
    lines="two"
  >
    <!-- <v-badge>
    <template v-slot:default>

    </template>
  </v-badge> -->
    <template v-slot:prepend>
      <v-avatar tile size="20" color="transparent" class="text-caption">
        <span :class="positionColor">
          {{ position }}
        </span>
      </v-avatar>
    </template>

    <v-list-item-subtitle>
      {{ player.FirstName }}
      {{ player.LastName }}

      <b class="font-weight-bold text-pink">
        [{{ Math.round(player.Rating) }}]
      </b>

      <template v-if="matchFinished">
        <template v-if="player.stats.Goals > 0">
          <v-icon class="ml-1" size="small" color="blue-accent-3">
            mdi-soccer
          </v-icon>
          x {{ player.stats.Goals }}
        </template>

        <template v-if="player.stats.Saves > 0">
          <v-icon class="ml-1" size="small" color="purple-accent-3">
            mdi-pan
          </v-icon>
          x {{ player.stats.Saves }}
        </template>

        <template v-if="player.stats.Assists > 0">
          <v-icon class="ml-1" size="small" color="green-accent-3">
            mdi-fullscreen
          </v-icon>
          x {{ player.stats.Assists }}
        </template>
      </template>
    </v-list-item-subtitle>

    <template v-if="matchFinished" v-slot:append>
      <v-avatar
        tile
        size="40"
        :color="matchRatingColor(Math.round(player.stats.Points))"
        class="text-caption"
      >
        <span class="text-white font-weight-bold">
          {{ Math.round(player.stats.Points) }}
        </span>
      </v-avatar>
    </template>
  </v-list-item>
</template>
<script setup lang="ts">
// TODO: Should show players after the Match rating
// TODO: Should indicate MOTM also
// TODO: Should also show who scored and how many goals. How do we add a pitch there?
import { computed } from 'vue';

interface Props {
  player: any;
  matchFinished?: any;
}

const props = withDefaults(defineProps<Props>(), {
  matchFinished: false,
});

const position = computed(() => {
  return props.player.Position;
});

const positionColor = computed(() => {
  switch (position.value) {
    case 'GK':
      return 'text-deep-orange-accent-3';
    case 'DEF':
      return 'text-red-accent-3';
    case 'MID':
      return 'text-green-accent-3';
    case 'ATT':
      return 'text-blue-accent-3';
    default:
      return 'text-secondary';
  }
});

const ratingColor = (rating: number): string => {
  if (rating >= 80) return 'green';
  else if (rating >= 50) return 'orange';
  else return 'red';
};

const matchRatingColor = (rating: number): string => {
  if (rating >= 8) return 'green';
  else if (rating >= 5) return 'orange';
  else return 'red';
};
</script>
