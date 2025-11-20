<template>
  <v-card background="transparent" color="transparent">
    <v-toolbar dense>
      <!-- Current day -->
      <v-toolbar-title
        v-if="calendar"
        class="text-subtitle-1 font-weight-bold text-indigo"
      >
        Day {{ calendar.CurrentDay }} - Year {{ calendar.YearString }}
      </v-toolbar-title>

      <v-spacer></v-spacer>

      <v-toolbar-items>
        <!-- select league -->
        <select
          class="text-indigo indigo-text"
          name="select_league"
          v-model="selectedLeagueId"
          @change="changeSelectedLeague(selectedLeagueId)"
        >
          <option disabled value="">Select League</option>
          <option
            v-for="(league, i) in leagues"
            v-bind:value="league._id"
            :key="i"
          >
            {{ league.Name }}
          </option>
        </select>

        <v-btn
          color="warning"
          v-if="calendar && calendar.allSeasonsCompleted"
          @click="endYear"
        >
          END YEAR
        </v-btn>
      </v-toolbar-items>
    </v-toolbar>

    <!-- Main -->
    <v-row>
      <v-col cols="8">
        <!-- Fixtures and next matches -->
        <v-card color="transparent">
          <v-sheet width="100%" color="indigo">
            <div class="text-center" v-if="selectedDay">
              <template v-if="!selectedDay.isFree">
                <v-row class="px-2">
                  <v-col cols="6">
                    <fixture-card
                      :Match="selectedMatch || selectedDay.Matches[0]"
                    ></fixture-card>
                  </v-col>

                  <v-col cols="6">
                    <v-card
                      style="height: 300px; max-height: 300px; overflow-y: auto"
                    >
                      <day-fixtures-list
                        :Matches="selectedDay.Matches"
                        Detail="details"
                        @match-selected="matchSelected"
                      ></day-fixtures-list>
                    </v-card>
                  </v-col>
                </v-row>
              </template>

              <template v-else>
                <v-card color="grey" height="190px">
                  <v-card-text>
                    No matches today
                    <v-icon>mdi-ball</v-icon>
                  </v-card-text>
                </v-card>
              </template>
            </div>
          </v-sheet>

          <!-- Fixtures scroller -->
          <v-sheet width="100%" color="dark" class="mt-5">
            <div>
              <v-list-subheader>
                Upcoming Fixtures
                <v-spacer></v-spacer>
                <v-btn
                  variant="text"
                  size="small"
                  color="indigo"
                  to="u/fixtures"
                >
                  View All
                </v-btn>
              </v-list-subheader>
            </div>
            <v-col cols="12">
              <day-scroll
                :days="days"
                :singleLeague="false"
                @selected-day-index-changed="selectDay"
              ></day-scroll>
            </v-col>
          </v-sheet>
        </v-card>

        <!-- Standings and other stuff -->
        <v-card class="mt-3">
          <div class="text-center">
            <template v-if="seasons">
              <v-tabs v-model="seasonTab">
                <v-tab v-for="(season, i) in seasons" :key="i">
                  {{ season.CompetitionCode }}
                </v-tab>
              </v-tabs>

              <v-window v-model="seasonTab">
                <v-window-item v-for="(season, i) in seasons" :key="i">
                  <standings-scroller
                    :standings="season.Standings"
                  ></standings-scroller>
                </v-window-item>
              </v-window>
            </template>
          </div>
        </v-card>
      </v-col>
      <v-col cols="4">
        <v-card>
          <v-list-subheader>Season Stats</v-list-subheader>
          <v-list>
            <v-list-item lines="three" v-for="(s, i) in seasons" :key="i">
              <v-list-item-title>{{ s.CompetitionCode }}</v-list-item-title>
              <span>
                <v-btn :to="`/u/stats/season/${s._id}`">
                  View Stats
                  <v-icon class="ml-1" color="primary">
                    mdi-chart-areaspline
                  </v-icon>
                </v-btn>
              </span>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@/store';
import DayScroll from '@/components/calendar/day-scroll.vue';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';
import FixtureCard from '@/components/user-dashboard/fixture-card.vue';
import DayFixturesList from '@/components/user-dashboard/day-fixtures-list.vue';
import { $axios } from '@/main';

const router = useRouter();
const store = useStore();

const match = ref({});
const selectedDayIndex = ref(0);
const seasonTab = ref<any>(null);
const leagues = ref<any>([]);
const selectedLeagueId = ref('');
const selectedLeague = ref<any>({});
const selectedMatch = ref<any>('');
const days = ref<any>([]);
const seasons = ref<any>([]);

const calendar = computed(() => store.calendar);
const currentDay = computed(() => store.calendar?.CurrentDay);
const lobby = computed(() => store.lobby);
const yearString = computed(() => store.calendar?.YearString);

const selectedDay = computed(() => days.value[selectedDayIndex.value]);

watch(
  currentDay,
  (day) => {
    if (day) getDays(day);
  },
  { immediate: true }
);

watch(
  lobby,
  (toLobby) => {
    if (toLobby) {
      router.push('/u/lobby');
    }
  },
  { immediate: true }
);

function endYear() {
  router.push(`/finish/year/${calendar.value?._id}`);
}

function changeSelectedLeague(league_id: string) {
  if (league_id) {
    store.setSelectedLeague(league_id);
    getLeagues(league_id);
    fetchCurrentSeason(league_id);
  }
}

function matchSelected(match: any) {
  selectedLeagueId.value = match.CompetitionId;
  changeSelectedLeague(match.CompetitionId);
  selectedMatch.value = match;
}

async function getDays(day: number) {
  const limit = 7;
  const week =
    calendar.value?.CurrentDay === 0
      ? 1
      : Math.ceil((calendar.value?.CurrentDay || 0) / limit);

  try {
    const response = await $axios.get(
      `/calendar/${yearString.value}/days?paginate=true&populate=true&limit=${limit}&week=${week}&not_played=true`
    );
    days.value = response.data.payload;
  } catch (error) {
    console.error('Error getting days of Calendar Year:', error);
  }
}

async function getLeagues(league_id?: string) {
  try {
    if (league_id) {
      const query = JSON.stringify({ _id: league_id });
      const response = await $axios.get(`/competitions/all?query=${query}`);
      selectedLeague.value = response.data.payload[0];
    } else {
      const query = JSON.stringify({ Type: 'league' });
      const response = await $axios.get(
        `/competitions/all?select=Name+Type+CompetitionCode&query=${query}`
      );
      leagues.value = response.data.payload;
    }
  } catch (error) {
    console.error('Error getting leagues:', error);
  }
}

async function fetchCurrentSeason(league_id: string) {
  if (calendar.value?.YearString) {
    try {
      const response = await $axios.get(
        `/seasons?query=${JSON.stringify({
          Year: calendar.value.YearString,
          Competition: selectedLeagueId.value,
        })}`
      );
      if (response.data.success) {
        seasons.value = response.data.payload;
      }
    } catch (error) {
      console.error('Error fetching current Seasons:', error);
    }
  }
}

function selectDay(val: number) {
  selectedDayIndex.value = val;
}

onMounted(() => {
  if (lobby.value) {
    router.push('/u/lobby');
  }
  getLeagues();
});
</script>
