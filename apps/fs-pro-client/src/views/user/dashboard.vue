<template>
  <v-card background="transparent" color="transparent">
    <v-toolbar density="compact">
      <!-- Current day -->
      <v-toolbar-title
        v-if="calendar"
        class="text-subtitle-1 font-weight-bold text-indigo"
      >
        Day {{ calendar.CurrentDay }} - {{ formattedGameDate }}
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
                  to="/u/friendly"
                >
                  Play Friendly
                </v-btn>
                <v-btn
                  variant="text"
                  size="small"
                  color="indigo"
                  to="/u/fixtures"
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
import { $axios } from '@/services/api';
import { groupFixturesByDay } from '@/helpers/calendar';
import { IFixture } from '@/interfaces/fixture';

const router = useRouter();
const store = useStore();

defineOptions({
  name: 'UserDashboard',
});

const selectedDayIndex = ref(0);
const seasonTab = ref<any>(null);
const leagues = ref<any>([]);
const selectedLeagueId = ref('');
const selectedLeague = ref<any>({});
const selectedMatch = ref<IFixture | null>(null);
const days = ref<any>([]);
const seasons = ref<any>([]);

const calendar = computed(() => store.calendar);
const currentDay = computed(() => store.calendar?.CurrentDay);
const lobby = computed(() => store.lobby);
const formattedGameDate = computed(() =>
  calendar.value?.CurrentDate
    ? new Date(calendar.value.CurrentDate).toDateString()
    : ''
);

const selectedDay = computed(() => days.value[selectedDayIndex.value]);

watch(
  currentDay,
  () => {
    if (currentDay.value !== undefined) getDays();
  },
  { immediate: true }
);

watch(lobby, (toLobby) => {
  if (toLobby && router.currentRoute.value.name !== 'User Lobby') {
    router.push('/u/lobby');
  }
});

function changeSelectedLeague(league_id: string) {
  if (league_id) {
    // day.vue matches fixtures by LeagueCode (the only league identifier a
    // bare Fixture carries), so the store keeps the code, not the id.
    const league = leagues.value.find((l: any) => l._id === league_id);
    store.setSelectedLeague(league?.CompetitionCode ?? '');
    getLeagues(league_id);
    fetchCurrentSeason();
  }
}

function matchSelected(match: IFixture) {
  const league = leagues.value.find(
    (l: any) => l.CompetitionCode === match.LeagueCode
  );
  if (league) {
    selectedLeagueId.value = league._id;
    changeSelectedLeague(league._id);
  }
  selectedMatch.value = match;
}

async function getDays() {
  const from = currentDay.value ?? 0;
  const to = from + 13;

  try {
    const response = await $axios.get(
      `/fixtures?scheduledDayFrom=${from}&scheduledDayTo=${to}`
    );
    days.value = groupFixturesByDay(response.data.payload as IFixture[]);
  } catch (error) {
    console.error('Error getting upcoming fixtures:', error);
  }
}

async function getLeagues(league_id?: string) {
  try {
    if (league_id) {
      const response = await $axios.get(`/competitions/all?id=${league_id}`);
      selectedLeague.value = response.data.payload[0];
    } else {
      const response = await $axios.get('/competitions/all?type=league');
      leagues.value = response.data.payload;
    }
  } catch (error) {
    console.error('Error getting leagues:', error);
  }
}

async function fetchCurrentSeason() {
  if (selectedLeagueId.value) {
    try {
      const response = await $axios.get(
        `/seasons?competition=${selectedLeagueId.value}&current=true`
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
  getLeagues();
});
</script>
