<template>
  <div>
    <v-tabs fixed-tabs v-model="tab">
      <v-tab>
        Squad
      </v-tab>

      <v-tab>
        Setup
      </v-tab>
    </v-tabs>
    <v-tabs-items v-model="tab">
      <v-tab-item>
        <div class="px-0 py-2">
          <dugout-club
            :matchFinished="matchFinished"
            :club="home"
            :clubSquad="homeSquad"
            :isHome="true"
          ></dugout-club>

          <v-divider></v-divider>
          <!-- Away Squad -->
          <dugout-club
            :matchFinished="matchFinished"
            :club="away"
            :clubSquad="awaySquad"
            :isHome="false"
          ></dugout-club>
        </div>
      </v-tab-item>
      <v-tab-item>
        <v-card-text>
          Coming soon...
        </v-card-text>
      </v-tab-item>
    </v-tabs-items>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import DugoutClub from './dugout-club.vue';

@Component({
  components: {
    DugoutClub,
  },
})
export default class Dugout extends Vue {
  @Prop({ required: true }) home!: any;
  @Prop({ required: true }) away!: any;
  @Prop({ required: false }) homeSquad!: any;
  @Prop({ required: false }) awaySquad!: any;
  @Prop({ required: false }) match!: any;
  @Prop({ required: false, default: false }) matchFinished!: any;

  private tab: any = null;

  private showHomeSquad = false;
  private showAwaySquad = false;

  get HomeSideDetails() {
    if (this.match) return this.match.HomeSideDetails;
    else return false;
  }

  get AwaySideDetails() {
    if (this.match) return this.match.AwaySideDetails;
    else return false;
  }
}
</script>
