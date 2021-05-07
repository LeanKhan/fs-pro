<template>
  <v-card>
    <v-toolbar flat color="indigo darken-1">
      <v-btn icon @click="$router.back()">
        <v-icon>
          mdi-arrow-left
        </v-icon>
      </v-btn>
      <v-toolbar-title class="ml-1">
        All Fixtures
      </v-toolbar-title>
      <v-spacer></v-spacer>

      <!-- <v-btn
              :disabled="!shouldReload"
              @click="fetchClub"
              icon
              color="white"
            >
              <v-icon>
                mdi-reload
              </v-icon>
            </v-btn> -->
    </v-toolbar>

    <v-card-text>
      <v-tabs
        background-color="transparent"
        dark
        color="indigo"
        next-icon="mdi-arrow-right-bold-box-outline"
        prev-icon="mdi-arrow-left-bold-box-outline"
        v-model="tab"
        show-arrows
      >
        <v-tabs-slider color="indigo"></v-tabs-slider>
        <v-tab v-for="(season, i) in seasons" :key="i">
          {{ season.CompetitionCode }}
        </v-tab>
      </v-tabs>

      <div>
        <template v-if="fixturesLoading">
          <v-progress-circular
            indeterminate
            :value="fixturesLoading"
          ></v-progress-circular>
        </template>

        <template>
          <fixtures-table :fixtures="selectedSeason.Fixtures"></fixtures-table>
        </template>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import FixturesTable from '@/components/seasons/fixtures-table.vue';

@Component({
  components: {
    FixturesTable,
  },
})
export default class Fixtures extends Vue {
  private tab = 0;

  private fixtures: any = {};

  private fixturesLoading = false;

  get seasons() {
    return this.$store.state.seasons;
  }

  get selectedSeason() {
    return this.seasons[this.tab];
  }

  @Watch('tab')
  onTabChanged(val: number) {
    console.log('Tab Changed! =>', val);
  }

  private getFixtures() {
    this.fixturesLoading = true;
    this.$axios
      .get(`/seasons/${this.selectedSeason._id}/fixtures`)
      .then(response => {
        this.fixtures = response.data.payload;
        console.log(response.data.payload);
      })
      .catch(error => {
        console.log('Error getting fixtures for Season :/', error);
      })
      .finally(() => {
        this.fixturesLoading = false;
      });
  }

  private mounted() {
    this.getFixtures();
  }
}
</script>

<style></style>
