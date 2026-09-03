<template>
  <div>
    <v-progress-linear
      v-if="isClubLoading"
      indeterminate
      color="green"
    />

    <v-alert
      v-else-if="isClubError"
      type="error"
      variant="tonal"
      class="ma-4"
    >
      Could not load club.
    </v-alert>

    <template v-else-if="club">
      <v-card>
        <v-toolbar>
          <v-toolbar-title>
            <template v-if="season && clubLeague">
              <v-icon size="x-large">custom:{{ club.ClubCode }}</v-icon>
              <v-chip
                size="small"
                class="ml-1 text-subtitle-1 font-weight-bold text-white"
              >
                {{ clubLeague.Name }}
              </v-chip>
            </template>
          </v-toolbar-title>

          <v-spacer />

          <v-icon size="x-large">custom:{{ club.ClubCode }}</v-icon>
          <span class="text-subtitle-1 font-weight-bold text-white">
            {{ club.Name }}
          </span>
        </v-toolbar>

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
              <v-card
                v-if="isFixturesLoading"
                color="primary"
                min-height="240"
                class="d-flex align-center justify-center"
              >
                <v-progress-circular indeterminate />
              </v-card>

              <v-card
                v-else-if="selectedDay"
                color="primary"
              >
                <template v-if="!selectedDay.isFree && selectedMatch">
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
                              custom:{{ selectedMatch.Home }}
                            </v-icon>
                          </v-avatar>

                          vs

                          <v-avatar tile size="70">
                            <v-icon
                              style="font-size: 70px; height: 70px"
                              size="x-large"
                            >
                              custom:{{ selectedMatch.Away }}
                            </v-icon>
                          </v-avatar>
                          <span>AWAY</span>

                          <div class="pa-0 text-center">
                            <p class="mb-2 text-caption text-white">
                              {{ selectedMatch.Title }}
                            </p>

                            <p class="mb-0 text-caption">
                              {{ selectedMatch.Stadium }}
                            </p>
                          </div>
                        </v-col>

                        <v-col cols="3">
                          <v-card-subtitle>
                            {{ selectedMatch.LeagueCode }}
                            <v-icon size="large" color="amber-lighten-3">
                              mdi-trophy
                            </v-icon>
                          </v-card-subtitle>

                          <template v-if="season?.isStarted">
                            <v-btn
                              :disabled="selectedMatch.Played"
                              :to="`/matchzone/${selectedMatch._id}`"
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

                <template v-if="clubDays.length">
                  <v-divider class="mx-2" />
                  <v-sheet
                    width="100%"
                    color="transparent"
                    class="mt-5 pb-3"
                  >
                    <day-scroll
                      :days="clubDays"
                      :singleLeague="true"
                      :club="club.ClubCode"
                      @selected-day-index-changed="selectDay"
                    />
                  </v-sheet>
                </template>
              </v-card>

              <v-card
                v-else
                color="grey-darken-2"
                min-height="190"
              >
                <v-card-text>No scheduled fixtures.</v-card-text>
              </v-card>

              <v-card color="deep-purple" class="mt-3">
                <v-progress-linear
                  v-if="isSeasonLoading"
                  indeterminate
                />

                <template v-else-if="season">
                  <v-card-title>{{ season.CompetitionCode }}</v-card-title>
                  <v-card-text>
                    <standings-scroller
                      :standings="season.Standings ?? []"
                    />
                  </v-card-text>
                </template>

                <template v-else>
                  <v-card-text>No season yet :/</v-card-text>
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
          <squad-zone :club="club" />
        </v-window-item>

        <v-window-item>
          <club-zone :club="club" @update-available="refresh" />
        </v-window-item>

        <v-window-item>
          <transfer-zone :club="club" @update-available="refresh" />
        </v-window-item>
      </v-window>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useStore } from '@/store';

import { ClubZone, SquadZone, TransferZone } from './zones';
import DayScroll from '@/components/calendar/day-scroll.vue';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';

import type {
  Club,
  Competition,
  Fixture,
  Season,
} from '@repo/api-contract';
import type { IDayGroup } from '@/interfaces/calendar';
import { client } from '@/services/api';
import { groupFixturesByDay } from '@/helpers/calendar';

defineOptions({
  name: 'ClubView',
});

const route = useRoute();
const store = useStore();
const queryClient = useQueryClient();

const tab = ref(0);
const selectedDayIndex = ref(0);

const calendar = computed(() => store.calendar);
const clubId = computed(() => route.params.id as string);

const clubQuery = useQuery({
  queryKey: computed(() => ['club', clubId.value]),
  queryFn: async () => {
    const response = await client.clubs.getClub.query({
      params: { id: clubId.value },
      query: { populate: 'true' },
    });

    if (response.status !== 200) {
      throw new Error(response.body.message);
    }

    return response.body.payload;
  },
  enabled: computed(() => !!clubId.value),
});

const club = computed<Club | null>(() => clubQuery.data.value ?? null);
const isClubLoading = computed(() => clubQuery.isLoading.value);
const isClubError = computed(() => clubQuery.isError.value);

const clubLeagueQuery = useQuery({
  queryKey: computed(() => ['club-league', club.value?.LeagueId]),
  queryFn: async () => {
    const leagueId = club.value?.LeagueId;

    if (!leagueId) {
      throw new Error('Club league not loaded');
    }

    const response = await client.competitions.getCompetitions.query({
      query: { id: leagueId },
    });

    if (response.status !== 200) {
      throw new Error(response.body.message);
    }

    return response.body.payload[0] ?? null;
  },
  enabled: computed(() => !!club.value?.LeagueId),
});

const clubLeague = computed<Competition | null>(() => {
  return clubLeagueQuery.data.value ?? null;
});

const seasonQuery = useQuery({
  queryKey: computed(() => ['club-season', club.value?.LeagueId]),
  queryFn: async () => {
    const leagueId = club.value?.LeagueId;

    if (!leagueId) {
      throw new Error('Club league not loaded');
    }

    const response = await client.seasons.getSeasons.query({
      query: {
        competition: leagueId,
        current: true,
      },
    });

    if (response.status !== 200) {
      throw new Error(response.body.message);
    }

    return response.body.payload[0] ?? null;
  },
  enabled: computed(() => !!club.value?.LeagueId),
});

const season = computed<Season | null>(() => seasonQuery.data.value ?? null);
const isSeasonLoading = computed(() => seasonQuery.isLoading.value);

const fixturesQuery = useQuery({
  queryKey: computed(() => [
    'club-fixtures',
    club.value?.ClubCode,
    season.value?._id,
    calendar.value?.CurrentDay ?? 0,
  ]),
  queryFn: async () => {
    const from = calendar.value?.CurrentDay ?? 0;
    const to = from + 13;

    const response = await client.fixtures.getFixtures.query({
      query: {
        season: season.value?._id,
        scheduledDayFrom: from,
        scheduledDayTo: to,
      },
    });

    if (response.status !== 200) {
      throw new Error(response.body.message);
    }

    return response.body.payload;
  },
  enabled: computed(() => !!club.value?.ClubCode),
});

const isFixturesLoading = computed(() => fixturesQuery.isLoading.value);

const days = computed<IDayGroup[]>(() => {
  const fixtures = fixturesQuery.data.value as Fixture[] | undefined;

  if (!fixtures?.length) {
    return [];
  }

  return groupFixturesByDay(fixtures);
});

const clubDays = computed<IDayGroup[]>(() => {
  if (!club.value) {
    return [];
  }

  const clubCode = club.value.ClubCode;

  return days.value.map((day) => {
    const Matches = day.Matches.filter(
      (match) => match.Home === clubCode || match.Away === clubCode
    );

    return {
      ...day,
      Matches,
      isFree: Matches.length === 0,
    };
  });
});

const selectedDay = computed(() => {
  return clubDays.value[selectedDayIndex.value] ?? null;
});

const selectedMatch = computed(() => {
  return selectedDay.value?.Matches?.[0] ?? null;
});

watch(
  () => clubId.value,
  () => {
    selectedDayIndex.value = 0;
  }
);

watch(
  () => clubDays.value.length,
  (length) => {
    if (!length) {
      selectedDayIndex.value = 0;
      return;
    }

    if (selectedDayIndex.value >= length) {
      selectedDayIndex.value = length - 1;
    }
  }
);

function selectDay(index: number) {
  selectedDayIndex.value = index;
}

async function refresh() {
  if (!club.value?._id) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['club', clubId.value] }),
    queryClient.invalidateQueries({ queryKey: ['club-league'] }),
    queryClient.invalidateQueries({ queryKey: ['club-season'] }),
    queryClient.invalidateQueries({ queryKey: ['club-fixtures'] }),
  ]);
}
</script>
