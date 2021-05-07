<template>
  <div class="align-center d-flex flex-column " :class="isHome">
    <v-card-subtitle v-if="!winner">
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
      <v-icon style="font-size: 100px; height: 100px" x-large>
        ${{ clubCode }}
      </v-icon>
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
    </div>

    <div class="caption">
      <span class="ma-0 pr-2">{{ clubPosition }}</span>
      -
      <span class="ma-0 pl-2">{{ clubPoints }}</span>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
@Component({})
export default class ClubWidget extends Vue {
  @Prop({ required: true }) readonly clubName: any;
  @Prop({ required: true }) readonly isHome: any;
  @Prop({ required: true }) readonly rating: any;
  @Prop({ required: true }) readonly clubCode: any;
  @Prop({ required: true }) readonly clubPosition: any;
  @Prop({ required: true }) readonly clubPoints: any;
  @Prop({ required: false }) readonly winner!: string;

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
