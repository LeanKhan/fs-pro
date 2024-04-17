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

      <v-subheader class="mx-auto">
        MATCHZONE

        <v-chip v-if="lastMatchOfSeason || fixture.isFinalMatch">
          LAST MATCH
        </v-chip>

        Matchday {{ fixture.MatchDay }}

        <v-chip v-if="simulateRest" small color="primary">simulation</v-chip>
      </v-subheader>

      <v-spacer></v-spacer>

      <v-btn
        v-if="!matchFinished"
        depressed
        small
        icon
        @click="$router.push('/u')"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>

      <v-btn
        v-else-if="!lastMatchOfSeason"
        color="pink accent-3"
        @click="$router.push('/u')"
      >
        FINISH MATCH
      </v-btn>

      <v-btn
        v-else-if="lastMatchOfSeason"
        color="green accent-3"
        @click="finishSeason()"
      >
        &lt; FINISH SEASON &gt;
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
              <v-spacer></v-spacer>

              <v-switch v-model="simulateRest" label="Simulate Rest"></v-switch>
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
                    class="
                      d-flex
                      justify-center
                      align-center
                      flex-column
                      caption
                    "
                  >
                    <span class="body-2 cyan--text text--accent-3">90:00</span>
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
                          :winner="winner"
                          :clubName="fixture.HomeTeam.Name"
                          :clubCode="fixture.Home"
                          :isHome="true"
                          :rating="fixture.HomeTeam.Rating"
                          :clubStandings="homeStandings"
                        ></club-widget>
                      </template>
                    </v-col>

                    <!-- Scores and stats -->
                    <v-col
                      cols="2"
                      class="
                        align-center
                        d-flex
                        flex-column
                        justify-center
                        text-center
                        py-4
                        px-0
                      "
                    >
                      <div style="width: 100%">
                        <div class="display-2 ma-0 d-flex justify-space-around">
                          <div>
                            <span>
                              {{ HomeTeamScore || '0' }}
                            </span>

                            <v-divider
                              style="
                                border-width: 2px !important;
                                border-radius: 2px !important;
                              "
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
                              {{ AwayTeamScore || '0' }}
                            </span>
                            <v-divider
                              style="
                                border-width: 2px !important;
                                border-radius: 2px !important;
                              "
                              class="pink accent-3"
                            ></v-divider>
                          </div>
                        </div>

                        <div>
                          <!-- <v-chip small class="mt-4">
                            Kickoff
                          </v-chip> -->
                          <v-btn
                            v-if="!allReady"
                            class="mt-2"
                            color="green accent-3"
                            @click="openLobby = true"
                          >
                            START
                          </v-btn>
                        </div>
                      </div>
                    </v-col>

                    <v-col cols="5" class="text-center">
                      <!-- Away team -->
                      <template v-if="fixture.AwayTeam">
                        <club-widget
                          :won="winner"
                          :clubName="fixture.AwayTeam.Name"
                          :clubCode="fixture.Away"
                          :isHome="false"
                          :rating="fixture.AwayTeam.Rating"
                          :clubStandings="awayStandings"
                        ></club-widget>
                      </template>
                    </v-col>
                  </v-row>

                  <!-- Setup button -->
                  <v-overlay absolute :value="starting && !matchFinished">
                    <v-progress-circular
                      color="success"
                      size="130"
                      width="15"
                      indeterminate
                    ></v-progress-circular>
                  </v-overlay>

                  <v-row no-gutters class="mt-2">
                    <v-col
                      class="
                        align-center
                        caption
                        d-flex
                        flex-column
                        justify-center
                        text-center
                      "
                    >
                      <div class="caption grey--text">
                        <span>
                          {{ fixture.SeasonCode }} - {{ fixture.Title }}
                        </span>
                        <p class="ma-0">
                          {{ fixture.Stadium }}
                        </p>
                        <p class="ma-0">
                          {{ fixture.Week }}
                        </p>
                      </div>
                    </v-col>
                  </v-row>
                </v-card>

                <v-row no-gutters>
                  <v-col cols="8" class="pr-1">
                    <v-card flat tile min-height="320px">
                      <v-toolbar color="green accent-3" dense flat tile>
                        Results
                      </v-toolbar>
                      <v-card-text class="d-flex justify-center flex-column">
                        <template v-if="!matchFinished">
                          No data yet...
                        </template>

                        <results
                          v-if="matchFinished"
                          :home="fixture.Home"
                          :away="fixture.Away"
                          :matchDetails="{
                            Home: fixture.HomeSideDetails,
                            Away: fixture.AwaySideDetails,
                          }"
                        ></results>
                      </v-card-text>
                    </v-card>
                  </v-col>

                  <v-col cols="4" class="pl-1">
                    <v-card flat tile min-height="320px">
                      <v-toolbar color="green accent-3" dense flat tile>
                        MOTM
                      </v-toolbar>
                      <v-card-text>
                        <template v-if="!matchFinished">No data</template>

                        <template v-else>
                          <motm :motm_id="MOTM"></motm>
                        </template>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </v-col>
              <!-- Events -->
              <v-col cols="4">
                <v-card
                  flat
                  tile
                  height="100%"
                  max-height="550px"
                  style="overflow-y: auto"
                >
                  <!-- <v-toolbar color="green accent-3" dense flat tile>
                    Timeline
                  </v-toolbar> -->
                  <v-card-subtitle
                    class="text-center cyan--text text--accent-3"
                  >
                    Timeline
                  </v-card-subtitle>
                  <v-card-text>
                    <template v-if="!matchFinished">No data yet...</template>
                    <!-- TODO: I think this Timeline should be moved to where 'MOTM' widget is and here will be the actual field.  -->
                    <!-- Thank you Jesus! -->
                    <timeline v-else :Events="fixture.Events"></timeline>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-card>
        </v-col>

        <!-- Other stuff.. userland -->
        <v-col cols="3" class="pl-2">
          <v-card tile height="100%">
            <v-toolbar color="green accent-3" dense flat tile>Dugout</v-toolbar>
            <dugout
              v-if="fixture.HomeTeam"
              :home="fixture.HomeTeam"
              :away="fixture.AwayTeam"
              :homeSquad="mappedHomeSquad"
              :awaySquad="mappedAwaySquad"
              :match="fixture"
              :matchFinished="matchFinished"
              :currentDay="currentDay"
              :currentFixture="fixture._id"
              @match-selected="matchSelected"
            ></dugout>
          </v-card>
        </v-col>
      </v-row>
      <game-lobby
        v-if="fixture.HomeTeam && fixture.AwayTeam"
        :show.sync="openLobby"
        @all-ready="ready"
        :home="{ Name: fixture.HomeTeam.Name, ClubCode: fixture.Home }"
        :away="{ Name: fixture.AwayTeam.Name, ClubCode: fixture.Away }"
      ></game-lobby>

      <v-skeleton-loader
        v-else
        class="mx-auto"
        max-width="500"
        type="card"
      ></v-skeleton-loader>
    </v-container>
  </div>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/camelcase */
import { Component, Vue } from 'vue-property-decorator';
import ClubWidget from '@/components/matchzone/club.vue';
import GameLobby from '@/components/matchzone/game-lobby.vue';
// Widgets //
import {
  Dugout,
  Results,
  Timeline,
  Motm,
} from '../../components/matchzone/widgets';
import { apiUrl } from '@/store';

@Component({
  name: 'MatchZone',
  components: {
    ClubWidget,
    Motm,
    GameLobby,
    Dugout,
    Results,
    Timeline,
  },
})
export default class MatchZone extends Vue {
  public api: string = apiUrl;

  public whistle: any;

  private fixture: any = {};

  private currentMatch: any = {};

  private currentDay: any = {};

  private allReady = false;

  private openLobby = false;

  private kickoffTimer = 0;

  private starting = false;

  private lastMatchOfSeason = false;

  private showPlayOverlay = true;

  private imSetup = false;

  // Match data //
  private matchDetails: any = {};

  private matchEvents: any = {};

  private homeSquad: any = {};

  private awaySquad: any = {};

  private otherResults: any = [];

  private standings: any = null;

  // Simulate rest
  private simulateRest = false;

  /** Computed */

  get user() {
    return this.$store.getters.user;
  }

  get winner() {
    if (
      this.fixture &&
      this.fixture.HomeSideDetails &&
      this.fixture.AwaySideDetails
    )
      return this.fixture.HomeSideDetails.Won &&
        !this.fixture.AwaySideDetails.Won
        ? 'home'
        : 'away';
    else return 'draw';
  }

  get fixtureId() {
    return this.$route.params.fixture;
  }

  get AwayTeamScore() {
    if (!this.fixture.Details) {
      return null;
    }

    return this.fixture.Details.AwayTeamScore;
  }

  get HomeTeamScore() {
    if (!this.fixture.Details) {
      return null;
    }

    return this.fixture.Details.HomeTeamScore;
  }

  get MOTM() {
    if (!this.fixture.Details) {
      return null;
    }

    return this.fixture.Details.MOTM;
  }

  // same as isPlayed
  get matchFinished() {
    return this.fixture.Played;
  }

  get isPlayed() {
    return this.fixture.Played;
  }

  /** Mathods */

  private ready() {
    this.openLobby = false;

    this.allReady = true;

    this.starting = true;

    this.playGame();
  }

  private timer() {
    let left = 0;

    const t = setInterval(() => {
      if (left > 3) {
        clearInterval(t);
      }

      this.kickoffTimer = 3 - left;
      left += 1;
    }, 1000);
  }

  private getFixture() {
    this.$axios
      .get(`/fixtures/${this.fixtureId}`, {
        params: {
          populate: JSON.stringify([
            { path: 'HomeTeam', populate: ['Players', 'Manager'] },
            { path: 'AwayTeam', populate: ['Players', 'Manager'] },
          ]),
        },
      })
      .then(response => {
        // Check for errors here o
        this.fixture = response.data.payload;

        this.getStandings();
      })
      .catch(response => {
        console.log('Error initiating game => ', response);
      })
      .finally(() => {
        this.starting = false;
      });
  }
  private finishSeason() {
    const ans = confirm(
      'Season is over hurray!\nEnd Season now... you must say okay.'
    );

    if (!ans) return false;

    // go to Season finishing page...
    this.$router.push(`/finish/season/${this.fixture.Season}`);
  }

  get mappedHomeSquad() {
    if (this.matchFinished && this.fixture.HomeSideDetails.PlayerStats) {
      return this.fixture.HomeTeam.Players.map((p: any) => ({
        ...p,
        stats: this.fixture.HomeSideDetails.PlayerStats.find(
          (s: any) => p._id == s.Player
        ),
      }));
    }

    return this.fixture.HomeTeam.Players;
  }

  get mappedAwaySquad() {
    if (this.matchFinished && this.fixture.AwaySideDetails.PlayerStats) {
      return this.fixture.AwayTeam.Players.map((p: any) => ({
        ...p,
        stats: this.fixture.AwaySideDetails.PlayerStats.find(
          (s: any) => p._id == s.Player
        ),
      }));
    }

    return this.fixture.AwayTeam.Players;
  }

  get homeStandings() {
    // find the clubs position in the league

    if (!this.standings) {
      return { position: 0, standing: null };
    }

    const position =
      this.standings.findIndex((c: any) => this.fixture.Home == c.ClubCode) + 1;

    return { position, standing: this.standings[position - 1] };
  }

  get awayStandings() {
    // find the clubs position in the league
    if (!this.standings) {
      return { position: 0, standing: null };
    }
    const position =
      this.standings.findIndex((c: any) => this.fixture.Away == c.ClubCode) + 1;

    return { position, standing: this.standings[position - 1] };
  }

  private playGame() {
    this.timer();

    this.whistle.play();

    const params: { simulate_rest: boolean; send_other_results: boolean } = {};

    if (this.simulateRest) {
      params.simulate_rest = true;
      // don't send the results of other matches...
      params.send_other_results = false;
    }

    this.$axios
      .get(`/game/kickoff-new/${this.fixtureId}`, { params })
      .then(response => {
        // Check for errors here o
        // console.log(response.data);
        let main = response.data.payload;

        if (response.data.payload.main) {
          main = response.data.payload.main;
        }

        const { match, HomeSideDetails, AwaySideDetails } = main;

        // TODO: please clean this up so you don't repeat stuff!
        this.fixture = {
          ...this.fixture,
          ...match,
          HomeTeam: this.fixture.HomeTeam,
          AwayTeam: this.fixture.AwayTeam,
          HomeSideDetails,
          AwaySideDetails,
        };
        this.lastMatchOfSeason = main.lastMatchOfSeason;
        this.getStandings();
        // fetch day again...
        this.getFixtureDay();
      })
      .catch(response => {
        console.log('Error playing match => ', response);
      });
  }

  private getFixtureDay() {
    this.$axios
      .get(`/calendar/day-of-fixture/${this.fixtureId}`)
      .then(response => {
        console.log(response.data);
        this.currentDay = response.data.payload;
      })
      .catch(response => {
        console.log('Error fetching Day of Fixture => ', response);
      });
  }

  // TODO: put these network fetching methods separately...
  private getStandings() {
    console.log('Fetching Standings');
    if (this.fixture.Season) {
      this.$axios
        .get(`/seasons/${this.fixture.Season}/standings`)
        .then(response => {
          console.log(response.data);
          this.standings = response.data.payload;
        })
        .catch(response => {
          console.log('Error fetching Standings => ', response);
        });
    }
  }

  private matchSelected(match: any) {
    if (this.fixture.Played) {
      this.$router.push({ params: { fixture: match.Fixture._id } });
      this.initializeGame();
    }
  }

  private initializeGame() {
    this.getFixture();
    this.getFixtureDay();
  }

  mounted() {
    this.whistle = new Audio('../../assets/sounds/whistle1.mp3');

    this.initializeGame();
  }
}
</script>
