<template>
  <div class="align-center d-flex flex-column">
    <v-card-subtitle>
      {{ clubName }} -
      <b>{{ clubCode }}</b>
    </v-card-subtitle>

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
        size="12px"
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

  get clubRating() {
    if (this.rating) {
      return Math.round(this.rating) / 20;
    } else {
      return 0;
    }
  }
}
</script>
