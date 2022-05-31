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
          <v-progress-circular indeterminate></v-progress-circular>
        </template>

        <template v-if="fixtures">
          <fixtures-table :fixtures="fixtures"></fixtures-table>
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

  private selectedYear = '';

  get currentYear() {
     return this.$store.getters.currentYear;
  }

  get seasons() {
    return this.$store.state.seasons;
  }

  get selectedSeason() {
    return this.seasons[this.tab];
  }

  @Watch('tab')
  onTabChanged(val: number) {
    console.log('Tab Changed! =>', val);
    this.getFixtures();
  }

// TODO: paginate this!
  private getFixtures() {
    this.fixturesLoading = true;
    const select = JSON.stringify('Title Home Away Details Played');
    this.$axios
      .get(`/seasons/${this.selectedSeason._id}/fixtures?select=${select}`)
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

  private fetchCurrentSeasons() {
    if(this.calendar && this.calendar.YearString){
      this.$axios
      .get(`/seasons?query=${JSON.stringify({Year: this.currentYear})}`)
      .then(response => {
        // Check for errors here o
        if (response.data.success) {
          this.seasons = response.data.payload;
        }
      })
      .catch(response => {
        console.log('Error fetching current Seasons! => ', response);
      });
    }
  }

  private mounted() {
    this.getFixtures();
    this.fetchCurrentSeasons();
  }
}
</script>

<style></style>
