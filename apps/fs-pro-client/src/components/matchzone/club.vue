<template>
  <div class="align-center d-flex flex-column" :class="isHome">
    <v-card-subtitle>
      {{ clubName }} -
      <b>{{ clubCode }}</b>
    </v-card-subtitle>

    <v-badge
      v-if="winner == side"
      bordered
      top
      color="gold"
      dot
      offset-x="10"
      offset-y="10"
    >
      <v-avatar tile size="30px">
        <v-icon color="gold" style="font-size: 30px; height: 30px" large>
          mdi-trophy
        </v-icon>
      </v-avatar>
    </v-badge>

    <v-avatar tile size="100px">
      <v-img
        :src="`${api}/img/clubs/logos/${clubCode}.png`"
        width="100px"
      ></v-img>
    </v-avatar>

    <div>
      <v-rating
        :value="clubRating"
        :half-increments="true"
        :readonly="true"
        size="14px"
        :color="isHome ? 'deep-purple darken-3' : 'pink accent-3'"
        background-color="secondary lighten-1"
      ></v-rating>
      <span class="caption text-muted ml-1">
        {{ $filters.roundTo(clubRating, 1) }}
      </span>
    </div>

    <div class="caption" v-if="clubStandings.standing">
      <span class="ma-0 pr-2">
        {{ $filters.ordinal(clubStandings.position) }}
      </span>
      -
      <span class="ma-0 pl-2">{{ clubStandings.standing.Points }} Pts</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, getCurrentInstance } from 'vue';
import { apiUrl } from '@/store';

interface Props {
  clubName: any;
  isHome: any;
  rating: any;
  clubCode: any;
  clubStandings?: any;
  winner?: string;
}

const props = defineProps<Props>();

const instance = getCurrentInstance();
const $filters = instance?.appContext.config.globalProperties.$filters;

const api = ref(apiUrl);

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
