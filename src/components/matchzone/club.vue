<template>
  <div class="align-center d-flex flex-column " :class="isHome">
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
      <span class="caption text-muted ml-1">{{ clubRating | roundTo(1) }}</span>
    </div>

    <div class="caption" v-if="clubStandings.standing">
      <span class="ma-0 pr-2">{{ clubStandings.position | ordinal }} </span>
      -
      <span class="ma-0 pl-2">{{ clubStandings.standing.Points }} Pts</span>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { apiUrl } from '@/store';

@Component({})
export default class ClubWidget extends Vue {
  @Prop({ required: true }) readonly clubName: any;
  @Prop({ required: true }) readonly isHome: any;
  @Prop({ required: true }) readonly rating: any;
  @Prop({ required: true }) readonly clubCode: any;
  @Prop({ required: false }) readonly clubStandings: any;
  @Prop({ required: false }) readonly winner!: string;

  private api = apiUrl;

  get clubRating() {
    if (this.rating) {
      return Math.round(this.rating) / 20;
    } else {
      return 0;
    }
  }

  get side() {
    return this.isHome ? 'home' : 'away';
  }
}
</script>
