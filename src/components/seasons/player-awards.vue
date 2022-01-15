<template>
  <v-card elevation="2" class="pa-2 my-4" color="green accent-3">
    <v-toolbar>
      Awards
      <v-icon>mdi-trophy</v-icon>
    </v-toolbar>
    <v-card-text class="white">
      <v-window
        v-model="step"
        reverse
        :continuous="true"
        :show-arrows="true"
        show-arrows-on-hover
      >
        <v-window-item v-for="(award, i) in awards" :key="i">
          <v-card>
            <v-img
              :src="`${api}/img/clubs/kits/${award.Club.ClubCode}-kit.png`"
              width="100px"
            ></v-img>
            <v-card-title>
              {{ award.Name }}
            </v-card-title>
            <v-card-subtitle>
              {{ award.Recipient.FirstName }} {{ award.Recipient.LastName }}
            </v-card-subtitle>
          </v-card>
        </v-window-item>
      </v-window>
    </v-card-text>
    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>
  </v-card>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/camelcase */
import { Component, Vue, Prop } from 'vue-property-decorator';
import { apiUrl } from '@/store';
@Component({})
export default class PlayerAwards extends Vue {
  // after end of season, check if the Year is alos over (that is, all the seasons are finished...)
  // then go to End Of Year...
  //   @Prop({ required: true }) stats_attributes!: string[];
  @Prop({ required: true }) seasonId!: string;

  private api = apiUrl;
  /**
   * Fetch Awards, thank you Jesus!
   */
  public fetchAwards() {
    this.loading = true;

    this.$axios
      .get(`/awards/season/${this.seasonId}?recipient=player&populate=club`)
      .then(response => {
        const managerIndex = response.data.payload.findIndex((a: any) => !a.Recipient);
        this.manager = response.data.payload.splice(managerIndex, 1);
        this.awards = response.data.payload;
        // thank you Jesus!
      })
      .catch(err => {
        console.log('Error fetching Season => ', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }
  private step = 0;

  private loading = false;

  private awards = [];

  private manager = {};

  //   private mounted() {
  //     //   load awards! Thank you Jesus!
  //     this.fetchAwards();
  //   }
}
</script>

<style></style>
