<template>
  <div>
    <v-card>
      <v-toolbar>
        <!-- Current day -->
        <v-toolbar-title>
          <template v-if="club && season">
            <v-icon x-large>${{ club.ClubCode }}</v-icon>
            <v-chip small class="ml-1 subtitle-1 font-weight-bold white--text">
              {{ club.League.Name }}
            </v-chip>
          </template>
        </v-toolbar-title>

        <v-spacer></v-spacer>
        <template v-if="club">
          <v-icon x-large>${{ club.ClubCode }}</v-icon>
          <span class="subtitle-1 font-weight-bold white--text">
            {{ club.Name }}
          </span>
        </template>
      </v-toolbar>

      <!-- Main -->
      <!-- TABS! -->
      <v-tabs fixed-tabs v-model="tab">
        <v-tab>Home</v-tab>
        <v-tab>Squad Zone</v-tab>
        <v-tab>Club Zone</v-tab>
        <v-tab>Transfer Zone</v-tab>
      </v-tabs>
    </v-card>

    <v-tabs-items
      background-color="transparent"
      color="transparent"
      v-model="tab"
    >
      <v-tab-item>
        <v-row>
          <v-col cols="8">
            <!-- Current Fixture -->
            <v-card v-if="selectedDay" color="primary">
              <template v-if="!selectedDay.isFree">
                <v-card
                  color="transparent"
                  min-height="180px"
                  class="text-center"
                  flat
                  tile
                >
                  <v-card-text>
                    <v-row>
                      <v-col cols="9">
                        <span>HOME</span>
                        <v-avatar tile size="70px">
                          <v-icon style="font-size: 70px; height: 70px" x-large>
                            ${{
                              selectedDay.Matches[competitionIndex].Fixture.Home
                            }}
                          </v-icon>
                        </v-avatar>

                        vs

                        <v-avatar tile size="70px">
                          <v-icon style="font-size: 70px; height: 70px" x-large>
                            ${{
                              selectedDay.Matches[competitionIndex].Fixture.Away
                            }}
                          </v-icon>
                        </v-avatar>
                        <span>AWAY</span>

                        <div class="pa-0 text-center">
                          <p class="mb-2 caption white--text">
                            {{
                              selectedDay.Matches[competitionIndex].Fixture
                                .Title
                            }}
                          </p>

                          <p class="mb-0 caption">
                            {{
                              selectedDay.Matches[competitionIndex].Fixture
                                .Stadium
                            }}
                          </p>
                        </div>
                      </v-col>

                      <v-col cols="3">
                        <v-card-subtitle>
                          {{
                            selectedDay.Matches[competitionIndex].Competition
                          }}
                          <v-icon large color="amber lighten-3">
                            mdi-trophy
                          </v-icon>
                        </v-card-subtitle>

                        <template v-if="season && season.isStarted">
                          <v-btn
                            :disabled="
                              selectedDay.Matches[competitionIndex].Fixture
                                .Played
                            "
                            :to="
                              '/matchzone/' +
                              selectedDay.Matches[
                                competitionIndex
                              ].Fixture._id.toString()
                            "
                          >
                            Play
                          </v-btn>
                        </template>
                      </v-col>
                    </v-row>
                  </v-card-text>
                </v-card>
              </template>

              <template v-else>
                <v-card color="grey" height="190px">
                  <v-card-text>
                    No matches today
                    <v-icon color="green">mdi-football</v-icon>
                  </v-card-text>
                </v-card>
              </template>

              <!-- Fixtures scroller -->
              <v-divider class="mx-2"></v-divider>
              <v-sheet width="100%" color="transparent" tile class="mt-5 pb-3">
                <day-scroll
                  :days="clubDays"
                  :singleLeague="true"
                  :club="club.ClubCode"
                  @selected-day-index-changed="selectDay"
                ></day-scroll>
              </v-sheet>
            </v-card>

            <!-- Standings -->
            <v-card color="deep-purple" class="mt-3">
              <template v-if="season">
                <v-card-title>{{ season.CompetitionCode }}</v-card-title>
                <v-card-text>
                  <standings-scroller
                    :standings="season.Standings"
                  ></standings-scroller>
                </v-card-text>
              </template>
              <template v-else>
                <span>No season yet :/</span>
              </template>
            </v-card>
          </v-col>
          <v-col cols="4">
            <v-card>
              <v-sheet height="400px" width="100%" color="green darken-2">
                Yeet beat
              </v-sheet>
            </v-card>
          </v-col>
        </v-row>
      </v-tab-item>
      <v-tab-item>
        <squad-zone :club="club"></squad-zone>
      </v-tab-item>
      <v-tab-item>
        <club-zone :club="club" @update-available="refresh"></club-zone>
      </v-tab-item>
      <v-tab-item>
        <transfer-zone></transfer-zone>
      </v-tab-item>
    </v-tabs-items>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@/store';
import { ClubZone, SquadZone, TransferZone } from './zones';
import DayScroll from '@/components/calendar/day-scroll.vue';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';
import { ICalendar, IDay } from '@/interfaces/calendar';
import { $axios } from '@/main';

const route = useRoute();
const router = useRouter();
const store = useStore();

const club = ref<any>({});
const selectedDayIndex = ref(0);
const tab = ref(null);
const seasonTab = ref(null);
const days = ref<IDay[]>([]);
const competitions = ref<IDay[]>([]);
const season = ref<any>({});
const limit = ref(14);

const calendar = computed<ICalendar>(() => store.calendar!);
const yearString = computed(() => store.calendar?.YearString);

const clubDays = computed(() => {
  return days.value.map((day) => {
    const Matches = day.Matches.filter((match) => {
      return match.Fixture.LeagueCode == club.value.LeagueCode;
    });
    return { ...day, Matches };
  });
});

const competitionIndex = computed(() => {
  let index = 0;
  switch (club.value.LeagueCode) {
    case 'EFL':
      index = 0;
      break;
    case 'EBSL':
      index = 1;
      break;
  }
  return index;
});

const selectedDay = computed(() => {
  if (days.value) {
    return days.value[selectedDayIndex.value];
  }
  return { isFree: false } as IDay;
});

const isClub = computed(() => {
  if (club.value) {
    return (
      selectedDay.value.Matches[competitionIndex.value].Fixture.Home ==
        club.value ||
      selectedDay.value.Matches[competitionIndex.value].Fixture.Away ==
        club.value
    );
  }
  return false;
});

function selectDay(val: number) {
  selectedDayIndex.value = val;
}

async function fetchCurrentSeason() {
  if (calendar.value && calendar.value.YearString) {
    try {
      const response = await $axios.get(
        `/seasons?query=${JSON.stringify({
          Year: calendar.value.YearString,
          Competition: club.value.League,
        })}`
      );
      if (response.data.success) {
        season.value = response.data.payload[0];
      }
    } catch (error) {
      console.error('Error fetching club current Season:', error);
    }
  }
}

async function fetchClub(clubId: string) {
  const populate = [
    {
      path: 'Players',
      select:
        'FirstName LastName Fullname Rating Position Nationality RatingsHistory Age',
    },
    { path: 'Manager' },
    { path: 'League', select: '-Clubs -Seasons' },
  ];

  try {
    const response = await $axios.get(
      `/clubs/${clubId}?populate=${JSON.stringify(populate)}`
    );
    if (response.data.success) {
      club.value = response.data.payload;
    }
  } catch (error) {
    console.error('Error fetching club:', error);
  }
}

async function getDays() {
  const query = `/calendar/${yearString.value}/days?paginate=true&populate=true&limit=${limit.value}&not_played=true`;

  try {
    const response = await $axios.get(query);
    days.value = response.data.payload;
  } catch (error) {
    console.error('Error getting Days of Calendar Year:', error);
  }
}

function refresh() {
  fetchClub(club.value._id);
}

onMounted(() => {
  const clubId = route.params.id as string;
  getDays();
  fetchClub(clubId);
  fetchCurrentSeason();
});
</script>
