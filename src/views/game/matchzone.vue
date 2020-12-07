<template>
  <div class="home">
    <v-app-bar dense app color="dark">
      <v-avatar tile size="30px">
        <v-icon style="font-size: 30px; height: 30px" large>
          ${{ fixture.Home }}
        </v-icon>
      </v-avatar>

      vs

      <v-badge
        bordered
        bottom
        color="green accent-3"
        dot
        offset-x="10"
        offset-y="10"
      >
        <v-avatar tile size="30px">
          <v-icon style="font-size: 30px; height: 30px" large>
            ${{ fixture.Away }}
          </v-icon>
        </v-avatar>
      </v-badge>

      <template v-if="connected">
        <v-chip>Match Room Connected!</v-chip>
      </template>

      <template v-if="!allConnected">
        <v-chip>Waiting For Second user</v-chip>
      </template>

      <v-subheader class="mx-auto">
        MATXHZONE
      </v-subheader>

      <v-spacer></v-spacer>

      <v-btn depressed small rounded @click="$router.push('/u')">
        <v-icon>
          mdi-close
        </v-icon>
      </v-btn>
    </v-app-bar>

    <v-container fluid class="pa-0">
      <v-row no-gutters>
        <!-- <v-col cols="2" class="pr-2">
          <v-card tile height="100%">
            <v-toolbar color="green accent-3" dense flat tile>
              Press
            </v-toolbar>
            <v-sheet>
              No match?
            </v-sheet>
          </v-card>
        </v-col> -->
        <v-col cols="9" class="px-1">
          <v-card tile height="100%">
            <v-toolbar color="green accent-3" dense flat tile>
              Field
            </v-toolbar>
            <!-- Data -->

            <v-row no-gutters>
              <v-col cols="8">
                <v-card
                  flat
                  tile
                  color="secondary darken-4"
                  class="py-2"
                  width="100%"
                >
                  <div
                    class="d-flex justify-center align-center flex-column caption"
                  >
                    <span class="body-2 cyan--text accent-3">84:00</span>
                    <span class="grey--text">
                      {{ fixture.LeagueCode }}
                    </span>
                  </div>

                  <!-- Match stuff -->
                  <v-row>
                    <v-col cols="5" class="text-center">
                      <!-- Home team -->
                      <template v-if="fixture.HomeTeam">
                        <club-widget
                          :clubName="fixture.HomeTeam.Name"
                          :clubCode="fixture.Home"
                          :isHome="true"
                          :rating="fixture.AwayTeam.Rating"
                          clubPosition="2nd"
                          clubPoints="20 Pts"
                        ></club-widget>
                      </template>
                    </v-col>

                    <!-- Scores and stats -->
                    <v-col
                      cols="2"
                      class="align-center d-flex flex-column justify-center text-center py-4 px-0"
                    >
                      <div style="width: 100%;">
                        <div class="display-2 ma-0 d-flex justify-space-around">
                          <div>
                            <span>
                              {{
                                matchFinished ? matchDetails.HomeTeamScore : 0
                              }}
                            </span>
                            <v-divider
                              style="border-width: 2px !important;border-radius: 2px !important"
                              class="deep-purple darken-3"
                            ></v-divider>
                          </div>
                          <span
                            class="text-muted secondary--text text--lighten-1"
                          >
                            :
                          </span>
                          <div>
                            <span>
                              {{
                                matchFinished ? matchDetails.AwayTeamScore : 0
                              }}
                            </span>
                            <v-divider
                              style="border-width: 2px !important; border-radius: 2px !important"
                              class="pink accent-3"
                            ></v-divider>
                          </div>
                        </div>

                        <div>
                          <v-chip small class="mt-4">
                            Kickoff
                          </v-chip>
                        </div>
                      </div>
                    </v-col>

                    <v-col cols="5" class="text-center">
                      <!-- Away team -->
                      <template v-if="fixture.AwayTeam">
                        <club-widget
                          :clubName="fixture.AwayTeam.Name"
                          :clubCode="fixture.Away"
                          :isHome="false"
                          :rating="fixture.AwayTeam.Rating"
                          clubPosition="1st"
                          clubPoints="23 Pts"
                        ></club-widget>
                      </template>
                    </v-col>
                  </v-row>

                  <!-- Setup button -->
                  <v-overlay absolute :value="showPlayOverlay">
                    <v-btn
                      v-if="!matchStarted"
                      class="mt-2"
                      color="green accent-3"
                      @click="startGame"
                    >
                      SETUP
                    </v-btn>
                  </v-overlay>

                  <v-row no-gutters class="mt-2">
                    <v-col
                      class="align-center caption d-flex flex-column justify-center text-center"
                    >
                      <div class="caption grey--text">
                        <span>
                          {{ fixture.SeasonCode }} - {{ fixture.Title }}
                        </span>
                        <p class="ma-0">
                          {{ fixture.Stadium }}
                        </p>
                        <p class="ma-0">
                          Yeet Club easy
                        </p>
                      </div>
                    </v-col>
                  </v-row>
                </v-card>

                <v-row no-gutters>
                  <v-col cols="8" class="pr-1">
                    <v-card flat tile height="320px">
                      <v-toolbar color="green accent-3" dense flat tile>
                        Results
                      </v-toolbar>
                      <v-card-text class="d-flex justify-center flex-column">
                        <template v-if="!matchFinished">
                          No data yet...
                        </template>

                        <results
                          v-else
                          :home="fixture.Home"
                          :away="fixture.Away"
                          :matchDetails="matchDetails"
                        ></results>
                      </v-card-text>
                    </v-card>
                  </v-col>

                  <v-col cols="4" class="pl-1">
                    <v-card flat tile height="320px">
                      <v-toolbar color="green accent-3" dense flat tile>
                        MOTM
                      </v-toolbar>
                      <v-card-text>
                        <template v-if="!matchFinished">
                          No data
                        </template>

                        <template v-else>
                          <v-badge bottom badge offset-x="10" offset-y="10">
                            <template v-slot:badge>
                              <v-avatar>
                                <v-icon>
                                  ${{ matchDetails.MOTM.clubcode }}
                                </v-icon>
                              </v-avatar>
                            </template>

                            <v-avatar tile size="70">
                              <v-icon
                                style="font-size: 70px; height: 70px"
                                large
                              >
                                mdi-ball
                              </v-icon>
                            </v-avatar>
                          </v-badge>
                        </template>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </v-col>
              <!-- Events -->
              <v-col cols="4">
                <v-card flat tile height="100%" max-height="700px">
                  <!-- <v-toolbar color="green accent-3" dense flat tile>
                    Timeline
                  </v-toolbar> -->
                  <v-card-subtitle
                    class="text-center"
                    color="green--text accent-3"
                  >
                    Timeline
                  </v-card-subtitle>
                  <v-card-text>
                    <template v-if="!matchFinished">
                      No data yet...
                    </template>
                    <!-- TODO: I think this Timeline should be moved to where 'MOTM' widget is and here will be the actual field.  -->
                    <!-- Thank you Jesus! -->
                    <timeline v-else></timeline>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-card>
        </v-col>

        <!-- Other stuff.. userland -->
        <v-col cols="3" class="pl-2">
          <v-card tile height="100%">
            <v-toolbar color="green accent-3" dense flat tile>
              Dugout

              <v-spacer></v-spacer>
              <v-toolbar-items>
                <v-btn :disabled="imSetup" class="mt-2" color="primary">
                  SETUP
                </v-btn>
              </v-toolbar-items>
            </v-toolbar>
            <dugout
              :home="fixture.HomeTeam"
              :away="fixture.AwayTeam"
              :homeSquad="homeSquad"
              :awaySquad="awaySquad"
            ></dugout>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <!-- <game-lobby
      :show.sync="openLobby"
      :imReady="imReady"
      @ready="ready"
    ></game-lobby> -->
  </div>
</template>

<script lang="ts">
// @ is an alias to /src
import { Component, Vue } from 'vue-property-decorator';
import ClubWidget from '@/components/matchzone/club.vue';
import GameLobby from '@/components/matchzone/game-lobby.vue';
// Widgets //
import { Dugout, Results, Timeline } from '../../components/matchzone/widgets';
import { apiUrl } from '@/store';

@Component({
  name: 'MatchZone',
  components: {
    ClubWidget,
    GameLobby,
    Dugout,
    Results,
    Timeline,
  },
})
export default class MatchZone extends Vue {
  public api: string = apiUrl;

  public fixtureId = '';

  private fixture: any = {};

  private currentMatch: any = {};

  private connected = false;

  private secondUserConnected = false;

  private openLobby = false;

  private matchFinished = false;

  private showPlayOverlay = true;

  private matchStarted = false;

  private imSetup = false;

  // Match data //
  private matchDetails: any = {};

  private matchEvents: any = {};

  private homeSquad: any = {};

  private awaySquad: any = {};

  /** Computed */

  get user() {
    return this.$store.getters.user;
  }

  /** Mathods */

  private initiateGame(fixture: string) {
    this.$axios
      .post(`/game/new-game`, { fixture, user: this.user.userID })
      .then(response => {
        // Check for errors here o
        console.log(response.data);

        this.fixture = response.data.fixture;
      })
      .catch(response => {
        console.log('Error initiating game => ', response);
      });
  }

  private playGame(fixture: string) {
    this.$axios
      .post(`/game/new-game`, { fixture, user: this.user.userID })
      .then(response => {
        // Check for errors here o
        console.log(response.data);

        this.fixture = response.data.fixture;
      })
      .catch(response => {
        console.log('Error initiating game => ', response);
      });
  }

  mounted() {
    // get match and send request...
    const fixtureId = this.$route.params.fixture;

    // this.openLobby = true;

    this.fixtureId = fixtureId;

    this.initiateGame(fixtureId);
  }
}
</script>
