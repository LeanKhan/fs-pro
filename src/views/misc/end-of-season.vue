<template>
  <div id="end-of-season">
    <v-container v-if="season" fluid class="pa-0">
      <v-toolbar dense color="dark">
        <v-toolbar-title class="mx-auto">
          End of {{ season.Year }} {{ season.CompetitionCode }} Season
        </v-toolbar-title>

        <v-spacer></v-spacer>

        <v-btn v-if="!season.isFinished" depressed small icon @click="close()">
          <v-icon>
            mdi-close
          </v-icon>
        </v-btn>

        <v-btn v-else color="pink accent-3" @click="close()">
          CONTINUE
        </v-btn>
      </v-toolbar>
      <v-row>
        <v-col cols="9" class="px-1">
          <v-card tile height="100%">
            <v-toolbar color="pink accent-3" dense flat tile>
              Season
            </v-toolbar>

            <v-sheet v-if="!season.isFinished">
              Ending Season
              <br />
              <v-btn
                block
                color="warning"
                :loading="loading"
                :disabled="loading"
                @click="finishSeason()"
              >
                Finish Now
              </v-btn>
            </v-sheet>

            <div
              class="h1"
              v-else-if="season.CompiledStandings || standings.length > 0"
            >
              Winner:
              <template v-if="standings.length > 0">
                <v-icon x-large>${{ standings[0].ClubCode }}</v-icon>
                {{ standings[0].ClubCode }}
              </template>

              <template v-else-if="season.CompiledStandings">
                <v-icon x-large>
                  ${{ season.CompiledStandings[0].ClubCode }}
                </v-icon>
                {{ season.CompiledStandings[0].ClubCode }}
              </template>
            </div>

            <div v-else>
              Season is over, but data is not displayed here yet...
            </div>
          </v-card>
        </v-col>

        <v-col cols="3" class="px-1">
          <v-card tile height="100%">
            <v-toolbar color="pink accent-3" dense flat tile>
              Final Standings
            </v-toolbar>

            <p v-if="!season.isFinished">Ending Season {{ season.Title }}</p>

            <!-- TODO: highlight promoted or relegated -->
            <standings
              v-else-if="standings || season.CompiledStandings"
              :WeekStandings="season.CompiledStandings || standings"
            ></standings>

            <div v-else>
              Season is over, but data is not displayed here yet...
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <!-- loading overlay -->
    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Standings from '@/components/seasons/standings.vue';

@Component({
  components: {
    Standings,
  },
})
export default class EndOfSeason extends Vue {
  // after end of season, check if the Year is alos over (that is, all the seasons are finished...)
  // then go to End Of Year...

  private loading = false;

  private season: any = {};

  private standings: any = {};

  private failToEnd = false;

  get seasonId() {
    return this.$route.params.season_id;
  }

  private close() {
    this.$router.push('/u');
  }

  private finishSeason() {
    console.log('Finishing Season...');
    this.loading = true;
    this.$axios
      .post(`/seasons/${this.seasonId}/finish`)
      .then(response => {
        if (response.data.success) {
          this.standings = response.data.payload.standings;
          this.season = response.data.payload.season;
        } else {
          this.failToEnd = true;
        }
      })
      .catch(err => {
        console.log('Error finishing => ', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  mounted() {
    console.log('Fetching Season...');
    this.loading = true;

    this.$axios
      .get(`/seasons/${this.seasonId}`)
      .then(response => {
        this.season = response.data.payload;
      })
      .catch(err => {
        console.log('Error fetching Season => ', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }
}
</script>

<style></style>
