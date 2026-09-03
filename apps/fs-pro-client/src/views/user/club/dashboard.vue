<template>
  <div>
    <v-card>
      <v-toolbar>
        <!-- Current day -->
        <v-toolbar-title>
          <template v-if="club && season && clubLeague">
            <v-icon size="x-large">custom:{{ club.ClubCode }}</v-icon>
            <v-chip
              size="small"
              class="ml-1 text-subtitle-1 font-weight-bold text-white"
            >
              {{ clubLeague.Name }}
            </v-chip>
          </template>
        </v-toolbar-title>

        <v-spacer></v-spacer>
        <template v-if="club">
          <v-icon size="x-large">custom:{{ club.ClubCode }}</v-icon>
          <span class="text-subtitle-1 font-weight-bold text-white">
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

    <v-window v-model="tab">
      <v-window-item>
        <v-row>
          <v-col cols="8">
            <!-- Current Fixture -->
            <v-card v-if="selectedDay" color="primary">
              <template v-if="!selectedDay.isFree">
                <v-card
                  color="transparent"
                  min-height="180px"
                  class="text-center"
                >
                  <v-card-text>
                    <v-row>
                      <v-col cols="9">
                        <span>HOME</span>
                        <v-avatar tile size="70">
                          <v-icon
                            style="font-size: 70px; height: 70px"
                            size="x-large"
                          >
                            custom:{{ selectedDay.Matches[0].Home }}
                          </v-icon>
                        </v-avatar>

                        vs

                        <v-avatar tile size="70">
                          <v-icon
                            style="font-size: 70px; height: 70px"
                            size="x-large"
                          >
                            custom:{{ selectedDay.Matches[0].Away }}
                          </v-icon>
                        </v-avatar>
                        <span>AWAY</span>

                        <div class="pa-0 text-center">
                          <p class="mb-2 text-caption text-white">
                            {{ selectedDay.Matches[0].Title }}
                          </p>

                          <p class="mb-0 text-caption">
                            {{ selectedDay.Matches[0].Stadium }}
                          </p>
                        </div>
                      </v-col>

                      <v-col cols="3">
                        <v-card-subtitle>
                          {{ selectedDay.Matches[0].LeagueCode }}
                          <v-icon size="large" color="amber-lighten-3">
                            mdi-trophy
                          </v-icon>
                        </v-card-subtitle>

                        <template v-if="season && season.isStarted">
                          <v-btn
                            :disabled="selectedDay.Matches[0].Played"
                            :to="
                              '/matchzone/' +
                              selectedDay.Matches[0]._id.toString()
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
              <v-sheet width="100%" color="transparent" class="mt-5 pb-3">
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
              <v-sheet height="400px" width="100%" color="green-darken-2">
                Yeet beat
              </v-sheet>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>
      <v-window-item>
        <squad-zone :club="club"></squad-zone>
      </v-window-item>
      <v-window-item>
        <club-zone :club="club" @update-available="refresh"></club-zone>
      </v-window-item>
      <v-window-item>
        <transfer-zone></transfer-zone>
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@/store';
import { ClubZone, SquadZone, TransferZone } from './zones';
import DayScroll from '@/components/calendar/day-scroll.vue';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';
import { IDayGroup } from '@/interfaces/calendar';
import { client } from '@/services/api';
import { groupFixturesByDay } from '@/helpers/calendar';

const route = useRoute();

const store = useStore();

const club = ref<any>({});
const clubLeague = ref<any>(null);
const selectedDayIndex = ref(0);
const tab = ref(null);

const days = ref<IDayGroup[]>([]);
const season = ref<any>({});

const calendar = computed(() => store.calendar);

const clubDays = computed(() => {
  return days.value.map((day) => {
    const Matches = day.Matches.filter((match) => {
      return (
        match.Home === club.value.ClubCode || match.Away === club.value.ClubCode
      );
    });
    return { ...day, isFree: Matches.length === 0, Matches };
  });
});

const selectedDay = computed<IDayGroup>(() => {
  return (
    days.value[selectedDayIndex.value] ?? { Day: 0, isFree: true, Matches: [] }
  );
});

function selectDay(val: number) {
  selectedDayIndex.value = val;
}

async function fetchCurrentSeason() {
  if (club.value.League) {
    try {
      const response = await client.seasons.getSeasons.query({
        query: { competition: club.value.League, current: true },
      });
      if (response.status === 200) {
        season.value = response.body.payload[0];
      }
    } catch (error) {
      console.error('Error fetching club current Season:', error);
    }
  }
}

async function fetchClubLeague() {
  if (!club.value.League) return;
  try {
    const response = await client.competitions.getCompetitions.query({
      query: { id: club.value.League },
    });
    if (response.status === 200) {
      clubLeague.value = response.body.payload[0];
    }
  } catch (error) {
    console.error('Error fetching club league:', error);
  }
}

async function fetchClub(clubId: string) {
  try {
    const response = await client.clubs.getClub.query({
      params: { id: clubId },
      query: { populate: 'true' },
    });
    if (response.status === 200) {
      club.value = response.body.payload;
      await fetchClubLeague();
    }
  } catch (error) {
    console.error('Error fetching club:', error);
  }
}

async function getDays() {
  const from = calendar.value?.CurrentDay ?? 0;
  const to = from + 13;

  try {
    const response = await client.fixtures.getFixtures.query({
      query: { scheduledDayFrom: from, scheduledDayTo: to },
    });
    if (response.status === 200) {
      days.value = groupFixturesByDay(response.body.payload);
    }
  } catch (error) {
    console.error('Error getting upcoming fixtures:', error);
  }
}

function refresh() {
  fetchClub(club.value._id);
}

onMounted(() => {
  const clubId = route.params.id as string;
  getDays();
  fetchClub(clubId).then(fetchCurrentSeason);
});
</script>
