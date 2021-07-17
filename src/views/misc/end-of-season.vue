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

              <!-- Show top Players! -->
              <v-subheader>Best Players by:</v-subheader>
              <table>
                <thead>
                  <th>
                    Points
                  </th>
                  <th>
                    Goals
                  </th>
                  <th>
                    Assists
                  </th>
                  <th>
                    Saves
                  </th>
                </thead>

                <tbody>
                  <tr>
                    <!-- TODO: Move these to a component -->
                    <td>
                      <v-btn
                        v-if="!HP_Player.length > 0"
                        :disabled="loading_player_stats"
                        :loading="loading_player_stats"
                        @click="loadHP_Player()"
                      >
                        Load
                      </v-btn>

                      <template v-else-if="HP_Player.length > 0">
                        <v-list>
                          <v-list-item v-for="(p, i) in HP_Player" :key="i">
                            <v-list-item-avatar>
                              <v-icon
                                style="font-size: 30px; height: 30px"
                                large
                              >
                                ${{ p.player.ClubCode }}
                              </v-icon>
                            </v-list-item-avatar>
                            <v-list-item-title>
                              {{ p.player.FirstName }} {{ p.player.LastName }}
                            </v-list-item-title>

                            <v-list-item-avatar size="40px" color="blue">
                              <span class="white--text font-weight-bold">
                                {{ p.points }}
                              </span>
                            </v-list-item-avatar>
                          </v-list-item>
                        </v-list>
                      </template>
                    </td>
                    <td>
                      <v-btn
                        v-if="!HG_Player.length > 0"
                        :disabled="loading_player_stats"
                        :loading="loading_player_stats"
                        @click="loadHG_Player()"
                      >
                        Load
                      </v-btn>

                      <template v-else-if="HG_Player.length > 0">
                        <v-list>
                          <v-list-item v-for="(p, i) in HG_Player" :key="i">
                            <v-list-item-avatar>
                              <v-icon
                                style="font-size: 30px; height: 30px"
                                large
                              >
                                ${{ p.player.ClubCode }}
                              </v-icon>
                            </v-list-item-avatar>
                            <v-list-item-title>
                              {{ p.player.FirstName }} {{ p.player.LastName }}
                            </v-list-item-title>

                            <v-list-item-avatar size="40px" color="blue">
                              <span class="white--text font-weight-bold">
                                {{ p.goals }}
                              </span>
                            </v-list-item-avatar>
                          </v-list-item>
                        </v-list>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
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
/* eslint-disable @typescript-eslint/camelcase */
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

  private loading_player_stats = false;

  private HP_Player = [];

  private HG_Player = [];

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

  // eslint-disable-next-line @typescript-eslint/camelcase
  private loadHP_Player() {
    this.loading_player_stats = true;
    this.$axios
      .get(
        `/players/stats?match_k=season._id&match_v=${this.seasonId}&sort_k=points&sort_v=-1`
      )
      .then(response => {
        if (response.data.success) {
          this.HP_Player = response.data.payload;
        }
      })
      .catch(err => {
        console.log('Error fetching Player points stats => ', err);
      })
      .finally(() => {
        this.loading_player_stats = false;
      });
  }

  // TODO: MAKE THIS DYNAMIC SO YOU DON'T HAVE TO BE REPEATING IT O
  private loadHG_Player() {
    this.loading_player_stats = true;
    this.$axios
      .get(
        `/players/stats?match_k=season._id&match_v=${this.seasonId}&sort_k=goals&sort_v=-1`
      )
      .then(response => {
        if (response.data.success) {
          this.HG_Player = response.data.payload;
        }
      })
      .catch(err => {
        console.log('Error fetching Player goals stats => ', err);
      })
      .finally(() => {
        this.loading_player_stats = false;
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
