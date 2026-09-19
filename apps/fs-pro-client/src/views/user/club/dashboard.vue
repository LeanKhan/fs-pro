<template>
  <div>
    <v-progress-linear v-if="isClubLoading" indeterminate color="green" />

    <v-alert v-else-if="isClubError" type="error" variant="tonal" class="ma-4">
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

          <div class="d-flex align-center gap-2">
            <v-icon size="x-large">custom:{{ club.ClubCode }}</v-icon>
            <span class="text-subtitle-1 font-weight-bold text-white">
              {{ club.Name }}
            </span>
            <v-chip
              v-if="isMyClub"
              size="small"
              color="success"
              variant="flat"
              class="font-weight-bold ml-2"
            >
              YOUR CLUB &bull; MANAGER & OWNER
            </v-chip>
            <template v-else>
              <v-chip
                size="small"
                color="info"
                variant="outlined"
                class="ml-2"
              >
                PUBLIC PROFILE &bull; AUTONOMOUS
              </v-chip>
              <v-chip
                v-if="club.Manager"
                size="small"
                color="amber-lighten-2"
                variant="tonal"
                class="ml-1"
              >
                Mgr: {{ club.Manager.FirstName }} {{ club.Manager.LastName }}
              </v-chip>
            </template>
          </div>
        </v-toolbar>

        <v-tabs fixed-tabs v-model="tab">
          <v-tab>Home</v-tab>
          <v-tab>{{ isMyClub ? 'Team Sheet' : 'Tactical Scouting' }}</v-tab>
          <v-tab>Squad Zone</v-tab>
          <v-tab>Club Zone</v-tab>
          <v-tab>{{ isMyClub ? "Director's Box" : 'Infrastructure' }}</v-tab>
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

              <v-card v-else-if="selectedDay" color="primary">
                <!-- Day Subheader & Match Selector (if multiple matches on selected day) -->
                <div v-if="selectedDay.Matches && selectedDay.Matches.length > 1" class="px-4 pt-2 pb-1 bg-surface-variant">
                  <div class="d-flex align-center justify-space-between mb-1">
                    <span class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                      Day {{ selectedDay.Day }} Matches ({{ selectedDay.Matches.length }})
                    </span>
                    <span class="text-caption text-medium-emphasis">Select a match to view details</span>
                  </div>
                  <v-slide-group show-arrows density="compact">
                    <v-slide-group-item
                      v-for="m in selectedDay.Matches"
                      :key="m._id"
                    >
                      <v-chip
                        size="small"
                        class="ma-1 font-weight-bold"
                        :color="selectedMatch?._id === m._id ? 'amber-accent-3' : (m.Home === club?.ClubCode || m.Away === club?.ClubCode ? 'green-accent-3' : 'default')"
                        :variant="selectedMatch?._id === m._id ? 'elevated' : 'tonal'"
                        @click="selectedMatchId = m._id?.toString() ?? null"
                      >
                        <v-icon size="16" class="mr-1">custom:{{ m.Home }}</v-icon>
                        <span>{{ m.Home }}</span>
                        <span class="mx-1 text-caption font-weight-black" v-if="m.Played && m.Details">
                          {{ m.Details.HomeTeamScore }}-{{ m.Details.AwayTeamScore }}
                        </span>
                        <span class="mx-1 text-caption" v-else>vs</span>
                        <span>{{ m.Away }}</span>
                        <v-icon size="16" class="ml-1">custom:{{ m.Away }}</v-icon>
                      </v-chip>
                    </v-slide-group-item>
                  </v-slide-group>
                </div>

                <template v-if="!selectedDay.isFree && selectedMatch">
                  <v-card
                    color="transparent"
                    min-height="180px"
                    class="text-center pa-2"
                  >
                    <v-card-text>
                      <v-row align="center">
                        <v-col cols="9">
                          <div class="d-flex align-center justify-center">
                            <!-- HOME -->
                            <div class="text-center" style="min-width: 110px;">
                              <v-avatar tile size="64" class="mb-1">
                                <v-icon
                                  style="font-size: 64px; height: 64px"
                                  size="x-large"
                                >
                                  custom:{{ selectedMatch.Home }}
                                </v-icon>
                              </v-avatar>
                              <div class="text-subtitle-2 font-weight-bold text-white">
                                {{ selectedMatch.Home }}
                              </div>
                              <div class="text-caption text-medium-emphasis">HOME</div>
                            </div>

                            <!-- SCORE / VS -->
                            <div class="text-center px-6">
                              <template v-if="selectedMatch.Played && selectedMatch.Details">
                                <div class="text-h3 font-weight-black text-amber-accent-2 mb-1">
                                  {{ selectedMatch.Details.HomeTeamScore }} : {{ selectedMatch.Details.AwayTeamScore }}
                                </div>
                                <v-chip size="x-small" color="success" variant="flat" class="font-weight-bold">
                                  FULL TIME
                                </v-chip>
                              </template>
                              <template v-else>
                                <div class="text-h4 font-weight-bold text-medium-emphasis mb-1">
                                  VS
                                </div>
                                <v-chip size="x-small" color="primary" variant="tonal">
                                  UPCOMING
                                </v-chip>
                              </template>
                            </div>

                            <!-- AWAY -->
                            <div class="text-center" style="min-width: 110px;">
                              <v-avatar tile size="64" class="mb-1">
                                <v-icon
                                  style="font-size: 64px; height: 64px"
                                  size="x-large"
                                >
                                  custom:{{ selectedMatch.Away }}
                                </v-icon>
                              </v-avatar>
                              <div class="text-subtitle-2 font-weight-bold text-white">
                                {{ selectedMatch.Away }}
                              </div>
                              <div class="text-caption text-medium-emphasis">AWAY</div>
                            </div>
                          </div>

                          <div class="pa-0 text-center mt-3">
                            <p class="mb-1 text-caption text-white font-weight-medium">
                              {{ selectedMatch.Title }}
                            </p>
                            <p class="mb-0 text-caption text-medium-emphasis">
                              {{ selectedMatch.Stadium }} &bull; {{ selectedMatch.LeagueCode }}
                            </p>
                          </div>
                        </v-col>

                        <v-col cols="3" class="d-flex flex-column align-center justify-center border-s">
                          <v-card-subtitle class="pa-0 mb-3 text-center">
                            <v-icon size="large" color="amber-lighten-3" class="mr-1">
                              mdi-trophy
                            </v-icon>
                            <span class="font-weight-bold">{{ selectedMatch.LeagueCode }}</span>
                          </v-card-subtitle>

                          <template v-if="selectedMatch.Played">
                            <v-btn
                              color="amber-accent-4"
                              variant="flat"
                              class="font-weight-bold text-black"
                              prepend-icon="mdi-clipboard-text-outline"
                              :to="`/matchzone/${selectedMatch._id}`"
                            >
                              Match Review
                            </v-btn>
                            <span class="text-caption text-medium-emphasis mt-1">
                              Stats &amp; 2D Replay
                            </span>
                          </template>
                          <template v-else-if="season?.isStarted">
                            <v-btn
                              color="green-darken-1"
                              variant="flat"
                              class="font-weight-bold"
                              prepend-icon="mdi-play"
                              :to="`/matchzone/${selectedMatch._id}`"
                            >
                              {{ (selectedMatch.Home === club?.ClubCode || selectedMatch.Away === club?.ClubCode) ? 'Play Match' : 'Simulate / Watch' }}
                            </v-btn>
                          </template>
                        </v-col>
                      </v-row>
                    </v-card-text>
                  </v-card>
                </template>

                <template v-else>
                  <v-card color="grey" height="190px" class="d-flex align-center justify-center">
                    <v-card-text class="text-center">
                      <div class="text-subtitle-1 mb-1">No matches scheduled for Day {{ selectedDay.Day }}</div>
                      <v-icon color="green" size="large">mdi-football</v-icon>
                    </v-card-text>
                  </v-card>
                </template>

                <template v-if="displayDays.length">
                  <v-divider class="mx-2" />
                  <!-- Filter bar: All League Fixtures vs My Club Only -->
                  <div class="d-flex justify-space-between align-center px-4 pt-3">
                    <span class="text-subtitle-2 font-weight-bold text-white">
                      League Fixture Calendar
                    </span>
                    <v-btn-toggle
                      v-model="fixtureFilterMode"
                      mandatory
                      density="compact"
                      color="primary"
                    >
                      <v-btn value="all" size="x-small">
                        All League Matches
                      </v-btn>
                      <v-btn value="club" size="x-small">
                        My Club Only
                      </v-btn>
                    </v-btn-toggle>
                  </div>

                  <v-sheet width="100%" color="transparent" class="mt-2 pb-3">
                    <day-scroll
                      v-model="selectedDayIndex"
                      :days="displayDays"
                      :singleLeague="true"
                      :club="club.ClubCode"
                      @selected-day-index-changed="selectDay"
                    />
                  </v-sheet>
                </template>
              </v-card>

              <v-card v-else color="grey-darken-2" min-height="190">
                <v-card-text>No scheduled fixtures.</v-card-text>
              </v-card>

              <v-card color="deep-purple" class="mt-3">
                <v-progress-linear v-if="isSeasonLoading" indeterminate />

                <template v-else-if="season">
                  <v-card-title>{{ season.CompetitionCode }}</v-card-title>
                  <v-card-text>
                    <standings-scroller :standings="season.Standings ?? []" />
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
          <team-sheet-zone
            :club="club"
            :read-only="!isMyClub"
            @update-available="refresh"
          />
        </v-window-item>

        <v-window-item>
          <squad-zone :club="club" @update-available="refresh" />
        </v-window-item>

        <v-window-item>
          <club-zone :club="club" @update-available="refresh" />
        </v-window-item>

        <v-window-item>
          <owner-zone
            :club="club"
            :read-only="!isMyClub"
            @update-available="refresh"
          />
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

import {
  ClubZone,
  SquadZone,
  TransferZone,
  TeamSheetZone,
  OwnerZone,
} from './zones';
import DayScroll from '@/components/calendar/day-scroll.vue';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';

import type { Club, Competition, Fixture, Season } from '@repo/api-contract';
import type { IDayGroup } from '@/interfaces/calendar';
import { client } from '@/services/api';
import { groupFixturesByDay } from '@/helpers/calendar';

defineOptions({
  name: 'ClubView',
});

const route = useRoute();
const store = useStore();
const queryClient = useQueryClient();

const tab = ref(route.query.tab !== undefined ? Number(route.query.tab) : 0);
const selectedDayIndex = ref(0);

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab !== undefined) {
      tab.value = Number(newTab);
    }
  }
);

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

const isMyClub = computed(() => {
  const currentClubId = club.value?._id;
  if (!currentClubId) return false;
  const userClubs = store.user?.clubs;
  if (!Array.isArray(userClubs)) return false;
  return userClubs.some(
    (c: any) => (typeof c === 'string' ? c : c._id) === currentClubId
  );
});

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
    const cur = calendar.value?.CurrentDay ?? 0;
    const from = Math.max(0, cur - 7);
    const to = cur + 14;

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

const fixtureFilterMode = ref<'all' | 'club'>('all');
const selectedMatchId = ref<string | null>(null);

const displayDays = computed<IDayGroup[]>(() => {
  if (fixtureFilterMode.value === 'club') {
    return clubDays.value;
  }
  return days.value;
});

const selectedDay = computed(() => {
  return displayDays.value[selectedDayIndex.value] ?? null;
});

const selectedMatch = computed(() => {
  if (!selectedDay.value || !selectedDay.value.Matches?.length) return null;
  if (selectedMatchId.value) {
    const found = selectedDay.value.Matches.find(
      (m) => m._id?.toString() === selectedMatchId.value
    );
    if (found) return found;
  }
  // Default to user club match if playing on this day
  const clubCode = club.value?.ClubCode;
  if (clubCode) {
    const clubM = selectedDay.value.Matches.find(
      (m) => m.Home === clubCode || m.Away === clubCode
    );
    if (clubM) return clubM;
  }
  return selectedDay.value.Matches[0];
});

watch(
  () => clubId.value,
  () => {
    selectedDayIndex.value = 0;
    selectedMatchId.value = null;
  }
);

watch(
  displayDays,
  (newDays) => {
    if (!newDays || !newDays.length) {
      selectedDayIndex.value = 0;
      selectedMatchId.value = null;
      return;
    }
    const cur = calendar.value?.CurrentDay ?? 0;
    const todayIdx = newDays.findIndex((d) => d.Day === cur);
    if (todayIdx !== -1) {
      selectedDayIndex.value = todayIdx;
    } else {
      const nextClosest = newDays.findIndex((d) => d.Day >= cur);
      selectedDayIndex.value = nextClosest !== -1 ? nextClosest : 0;
    }
    selectedMatchId.value = null;
  },
  { immediate: true }
);

function selectDay(index: number) {
  selectedDayIndex.value = index;
  selectedMatchId.value = null;
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
