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
              Results
            </v-toolbar>

            <v-sheet class="pa-4 danger" v-if="!season.isFinished">
              Ending Season
              <br />
              <v-btn
                color="warning"
                :loading="loading"
                :disabled="loading"
                @click="finishSeason()"
              >
                Finish Now
              </v-btn>
            </v-sheet>

            <v-sheet
              class="d-flex flex-column pa-3 v-toolbar v-toolbar--prominent justify-center text-center"
              v-else-if="season.CompiledStandings || standings.length > 0"
            >
              <p>
                Having Successfully completed
                {{ season.Fixtures.length }} matches and come out on top,
                {{ season.Winner.Name }} is thereby crowned champions of the
                league.
              </p>
              <div>
                <template v-if="standings.length > 0">
                  <v-img
                    class="mx-auto"
                    :src="`${api}/img/clubs/logos/${standings[0].ClubCode}.png`"
                    width="140px"
                  ></v-img>
                </template>

                <template v-else-if="season.CompiledStandings">
                  <v-img
                    class="mx-auto"
                    :src="
                      `${api}/img/clubs/logos/${season.CompiledStandings[0].ClubCode}.png`
                    "
                    width="140px"
                  ></v-img>
                </template>

                <p class="subtitle-1">
                  Champions {{ season.CompetitionCode }}
                  {{ season.Year }} Season
                </p>
              </div>
            </v-sheet>

            <div v-else>
              Season is over, but data is not displayed here yet...
            </div>

            <template v-if="season.isFinished">
              <player-awards
                ref="awardsComponent"
                :seasonId="seasonId"
              ></player-awards>
            </template>

            <!-- Show top Players! -->
            <player-stats :seasonId="seasonId"></player-stats>
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
/* eslint-disable @typescript-eslint/camelcase */
import { Component, Vue, Ref } from 'vue-property-decorator';
import Standings from '@/components/seasons/standings.vue';
import PlayerStats from '@/components/seasons/player-stats.vue';
import PlayerAwards from '@/components/seasons/player-awards.vue';
import { apiUrl } from '@/store';

@Component({
  components: {
    Standings,
    PlayerStats,
    PlayerAwards,
  },
})
export default class EndOfSeason extends Vue {
  @Ref('awardsComponent') readonly awardsComponent!: PlayerAwards;
  // after end of season, check if the Year is alos over (that is, all the seasons are finished...)
  // then go to End Of Year...

  private loading = false;

  private api = apiUrl;

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

          this.$nextTick(() => {
            console.log('Inside nextTick at ', new Date());
            console.log(this.$refs.awardsComponent);

            this.awardsComponent.fetchAwards();
          });
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
      .get(`/seasons/${this.seasonId}?populate=Fixtures Winner`)
      .then(response => {
        this.season = response.data.payload;

        if (this.season.isFinished) {
          this.$nextTick(() => {
                       this.awardsComponent.fetchAwards();
          });
        }
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
