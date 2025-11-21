<template>
  <div class="home">
    <v-app-bar dense app color="dark">
      <v-avatar tile size="30px">
        <v-icon style="font-size: 30px; height: 30px" large>
          custom:{{ fixture.Home }}
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
            custom:{{ fixture.Away }}
          </v-icon>
        </v-avatar>
      </v-badge>

      <v-list-subheader class="mx-auto">
        MATCHZONE

        <v-chip v-if="lastMatchOfSeason || fixture.isFinalMatch">
          LAST MATCH
        </v-chip>

        Matchday {{ fixture.MatchDay }}

        <v-chip v-if="simulateRest" size="small" color="primary">
          simulation
        </v-chip>
      </v-list-subheader>

      <v-spacer></v-spacer>

      <v-btn
        v-if="!matchFinished"
        variant="flat"
        size="small"
        icon
        @click="router.push('/u')"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>

      <v-btn
        v-else-if="!lastMatchOfSeason"
        color="pink-accent-3"
        @click="router.push('/u')"
      >
        FINISH MATCH
      </v-btn>

      <v-btn
        v-else-if="lastMatchOfSeason"
        color="green-accent-3"
        @click="finishSeason"
      >
        &lt; FINISH SEASON &gt;
      </v-btn>
    </v-app-bar>

    <v-container fluid class="pa-0">
      <v-row no-gutters>
        <v-col cols="9" class="px-1">
          <v-card tile height="100%">
            <v-toolbar color="green accent-3" dense flat tile>
              Field
              <v-spacer></v-spacer>
              <v-switch v-model="simulateRest" label="Simulate Rest"></v-switch>
            </v-toolbar>

            <v-row no-gutters>
              <v-col cols="8">
                <v-card
                  flat
                  tile
                  color="secondary-darken-4"
                  class="py-2"
                  width="100%"
                >
                  <div
                    class="d-flex justify-center align-center flex-column text-caption"
                  >
                    <span class="text-body-2 text-cyan text-accent-3">
                      90:00
                    </span>
                    <span class="text-grey">{{ fixture.LeagueCode }}</span>
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
                      class="align-center d-flex flex-column justify-center text-center py-4 px-0"
                    >
                      <div style="width: 100%">
                        <div class="text-h2 ma-0 d-flex justify-space-around">
                          <div>
                            <span>{{ HomeTeamScore || '0' }}</span>
                            <v-divider
                              style="
                                border-width: 2px !important;
                                border-radius: 2px !important;
                              "
                              class="deep-purple-darken-3"
                            ></v-divider>
                          </div>
                          <span
                            class="text-muted text-secondary text-lighten-1"
                          >
                            :
                          </span>
                          <div>
                            <span>{{ AwayTeamScore || '0' }}</span>
                            <v-divider
                              style="
                                border-width: 2px !important;
                                border-radius: 2px !important;
                              "
                              class="pink-accent-3"
                            ></v-divider>
                          </div>
                        </div>

                        <div>
                          <v-btn
                            v-if="!allReady"
                            class="mt-2"
                            color="green-accent-3"
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
                  <v-overlay absolute :model-value="starting && !matchFinished">
                    <v-progress-circular
                      color="success"
                      size="130"
                      width="15"
                      indeterminate
                    ></v-progress-circular>
                  </v-overlay>

                  <v-row no-gutters class="mt-2">
                    <v-col
                      class="align-center text-caption d-flex flex-column justify-center text-center"
                    >
                      <div class="text-caption text-grey">
                        <span>
                          {{ fixture.SeasonCode }} - {{ fixture.Title }}
                        </span>
                        <p class="ma-0">{{ fixture.Stadium }}</p>
                        <p class="ma-0">{{ fixture.Week }}</p>
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
                  <v-card-subtitle class="text-center text-cyan text-accent-3">
                    Timeline
                  </v-card-subtitle>
                  <v-card-text>
                    <template v-if="!matchFinished">No data yet...</template>
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

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStore } from '@/store';
import ClubWidget from '@/components/matchzone/club.vue';
import GameLobby from '@/components/matchzone/game-lobby.vue';
import {
  Dugout,
  Results,
  Timeline,
  Motm,
} from '@/components/matchzone/widgets';
import { $axios } from '@/main';

const router = useRouter();
const route = useRoute();
const store = useStore();

const whistle = ref<HTMLAudioElement>();
const fixture = ref<any>({});
const currentMatch = ref<any>({});
const currentDay = ref<any>({});
const allReady = ref(false);
const openLobby = ref(false);
const kickoffTimer = ref(0);
const starting = ref(false);
const lastMatchOfSeason = ref(false);
const showPlayOverlay = ref(true);
const imSetup = ref(false);
const matchDetails = ref<any>({});
const matchEvents = ref<any>({});
const homeSquad = ref<any>({});
const awaySquad = ref<any>({});
const otherResults = ref<any[]>([]);
const standings = ref<any>(null);
const simulateRest = ref(false);

const user = computed(() => store.user);

const winner = computed(() => {
  if (
    fixture.value &&
    fixture.value.HomeSideDetails &&
    fixture.value.AwaySideDetails
  ) {
    return fixture.value.HomeSideDetails.Won &&
      !fixture.value.AwaySideDetails.Won
      ? 'home'
      : 'away';
  }
  return 'draw';
});

const fixtureId = computed(() => route.params.fixture);

const AwayTeamScore = computed(() => {
  if (!fixture.value.Details) return null;
  return fixture.value.Details.AwayTeamScore;
});

const HomeTeamScore = computed(() => {
  if (!fixture.value.Details) return null;
  return fixture.value.Details.HomeTeamScore;
});

const MOTM = computed(() => {
  if (!fixture.value.Details) return null;
  return fixture.value.Details.MOTM;
});

const matchFinished = computed(() => fixture.value.Played);

const isPlayed = computed(() => fixture.value.Played);

const mappedHomeSquad = computed(() => {
  if (matchFinished.value && fixture.value.HomeSideDetails.PlayerStats) {
    return fixture.value.HomeTeam.Players.map((p: any) => ({
      ...p,
      stats: fixture.value.HomeSideDetails.PlayerStats.find(
        (s: any) => p._id == s.Player
      ),
    }));
  }
  return fixture.value.HomeTeam.Players;
});

const mappedAwaySquad = computed(() => {
  if (matchFinished.value && fixture.value.AwaySideDetails.PlayerStats) {
    return fixture.value.AwayTeam.Players.map((p: any) => ({
      ...p,
      stats: fixture.value.AwaySideDetails.PlayerStats.find(
        (s: any) => p._id == s.Player
      ),
    }));
  }
  return fixture.value.AwayTeam.Players;
});

const homeStandings = computed(() => {
  if (!standings.value) {
    return { position: 0, standing: null };
  }
  const position =
    standings.value.findIndex((c: any) => fixture.value.Home == c.ClubCode) + 1;
  return { position, standing: standings.value[position - 1] };
});

const awayStandings = computed(() => {
  if (!standings.value) {
    return { position: 0, standing: null };
  }
  const position =
    standings.value.findIndex((c: any) => fixture.value.Away == c.ClubCode) + 1;
  return { position, standing: standings.value[position - 1] };
});

function ready() {
  openLobby.value = false;
  allReady.value = true;
  starting.value = true;
  playGame();
}

function timer() {
  let left = 0;
  const t = setInterval(() => {
    if (left > 3) {
      clearInterval(t);
    }
    kickoffTimer.value = 3 - left;
    left += 1;
  }, 1000);
}

async function getFixture() {
  try {
    const response = await $axios.get(`/fixtures/${fixtureId.value}`, {
      params: {
        populate: JSON.stringify([
          { path: 'HomeTeam', populate: ['Players', 'Manager'] },
          { path: 'AwayTeam', populate: ['Players', 'Manager'] },
        ]),
      },
    });

    fixture.value = response.data.payload;

    if (response.data.payload.isFinalMatch && response.data.payload.Played) {
      console.log('Is Final Match! Finish Season :)');
      lastMatchOfSeason.value = true;
    }

    getStandings();
  } catch (error) {
    console.error('Error initiating game:', error);
  } finally {
    starting.value = false;
  }
}

function finishSeason() {
  const ans = confirm(
    'Season is over hurray!\nEnd Season now... you must say okay.'
  );
  if (!ans) return;
  router.push(`/finish/season/${fixture.value.Season}`);
}

async function playGame() {
  timer();
  whistle.value?.play();

  const params: { simulate_rest?: boolean; send_other_results?: boolean } = {};
  if (simulateRest.value) {
    params.simulate_rest = true;
    params.send_other_results = false;
  }

  try {
    const response = await $axios.get(`/game/kickoff-new/${fixtureId.value}`, {
      params,
    });
    let main = response.data.payload;
    if (response.data.payload.main) {
      main = response.data.payload.main;
    }

    const { match, HomeSideDetails, AwaySideDetails } = main;
    fixture.value = {
      ...fixture.value,
      ...match,
      HomeTeam: fixture.value.HomeTeam,
      AwayTeam: fixture.value.AwayTeam,
      HomeSideDetails,
      AwaySideDetails,
    };
    lastMatchOfSeason.value = main.lastMatchOfSeason;
    getStandings();
    getFixtureDay();
  } catch (error) {
    console.error('Error playing match:', error);
  }
}

async function getFixtureDay() {
  try {
    const response = await $axios.get(
      `/calendar/day-of-fixture/${fixtureId.value}`
    );
    currentDay.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching Day of Fixture:', error);
  }
}

async function getStandings() {
  if (fixture.value.Season) {
    try {
      const response = await $axios.get(
        `/seasons/${fixture.value.Season}/standings`
      );
      standings.value = response.data.payload;
    } catch (error) {
      console.error('Error fetching Standings:', error);
    }
  }
}

function matchSelected(match: any) {
  if (fixture.value.Played) {
    router.push({ params: { fixture: match.Fixture._id } });
    initializeGame();
  }
}

function initializeGame() {
  getFixture();
  getFixtureDay();
}

onMounted(() => {
  whistle.value = new Audio('../../assets/sounds/whistle1.mp3');
  initializeGame();
});
</script>
```
