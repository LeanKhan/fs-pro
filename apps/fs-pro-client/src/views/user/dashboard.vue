<template>
  <v-card background="transparent" color="transparent">
    <!-- Top System Toolbar -->
    <v-toolbar density="compact" class="mb-3 rounded-lg">
      <v-toolbar-title
        v-if="calendar"
        class="text-subtitle-1 font-weight-bold text-indigo d-flex align-center gap-2"
      >
        <span>Day {{ calendar.CurrentDay }} - {{ formattedGameDate }}</span>
        <v-chip size="x-small" color="success" variant="flat" class="ml-2">
          Living World Active
        </v-chip>
      </v-toolbar-title>

      <v-spacer></v-spacer>

      <v-toolbar-items class="align-center">
        <v-btn variant="text" size="small" color="indigo-lighten-2" to="/u/competitions" prepend-icon="mdi-trophy-outline">
          Competitions
        </v-btn>
      </v-toolbar-items>
    </v-toolbar>

    <year-progress v-if="openPlay.settings" :settings="openPlay.settings" class="mb-3" />

    <!-- Actor Identity Bar (Manager & Owner Command Center) -->
    <v-card
      v-if="userClub"
      class="mb-4 pa-4 elevation-3 border"
      style="background: linear-gradient(135deg, rgba(30, 34, 53, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%); border-color: rgba(99, 102, 241, 0.3) !important;"
    >
      <v-row align="center" justify="space-between">
        <!-- Club Brand & Actor Persona -->
        <v-col cols="12" md="4" class="d-flex align-center gap-3">
          <v-avatar size="56" color="indigo-darken-3" class="elevation-2">
            <v-icon size="36">custom:{{ userClub.ClubCode }}</v-icon>
          </v-avatar>
          <div>
            <div class="d-flex align-center gap-2">
              <span class="text-h6 font-weight-bold text-white">{{ userClub.Name }}</span>
              <v-chip size="x-small" color="indigo" class="text-uppercase font-weight-bold">
                {{ userClub.ClubCode }}
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis d-flex align-center flex-wrap ga-2">
              <level-badge
                :xp="clubInfo?.XP ?? 0"
                :thresholds="openPlay.settings?.levelThresholds"
                :size="22"
                show-label
              />
              <span>Elo {{ Math.round(clubInfo?.Elo ?? 1500) }}</span>
              <span>
                &bull; Entries {{ openPlay.entriesUsed }}/{{ openPlay.settings?.maxConcurrentEntries ?? '—' }}
              </span>
            </div>
            <div class="mt-2">
              <v-btn
                size="small"
                color="amber-darken-2"
                variant="flat"
                class="font-weight-black"
                :to="`/game/${userClub._id}`"
              >
                <v-icon start size="16">mdi-shield-crown</v-icon>
                Play
              </v-btn>
            </div>
          </div>
        </v-col>

        <!-- Manager Quick Desk -->
        <v-col cols="12" sm="6" md="4">
          <v-card variant="tonal" color="indigo-darken-4" class="pa-2 px-3 rounded-lg">
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="text-caption font-weight-bold text-indigo-lighten-2">
                <v-icon size="small" class="mr-1">mdi-strategy</v-icon> MANAGER DESK
              </span>
              <v-btn
                size="x-small"
                variant="text"
                color="indigo-lighten-1"
                :to="`/u/clubs/${userClub._id}/${userClub.ClubCode}?tab=1`"
              >
                Pitch & Tactics <v-icon size="x-small">mdi-chevron-right</v-icon>
              </v-btn>
            </div>
            <div class="d-flex align-center gap-3 text-caption">
              <div>
                <span class="text-medium-emphasis">Shape: </span>
                <strong class="text-white">{{ userClub.Tactic?.formation ?? '4-3-3' }}</strong>
                <span class="text-medium-emphasis ml-1">({{ userClub.Tactic?.playStyle ?? 'balanced' }})</span>
              </div>
              <v-divider vertical class="mx-1" />
              <div>
                <span class="text-medium-emphasis">Fitness: </span>
                <strong :class="avgSquadFitness >= 85 ? 'text-success' : 'text-warning'">
                  {{ avgSquadFitness }}%
                </strong>
                <span v-if="injuredCount > 0" class="text-error ml-1">
                  ({{ injuredCount }} inj)
                </span>
              </div>
            </div>
            <div v-if="nextClubFixture" class="text-caption text-truncate mt-1 text-grey-lighten-1">
              <v-icon size="x-small" color="amber">mdi-calendar-clock</v-icon>
              Day {{ nextClubFixture.day }}: vs <strong>{{ nextClubFixture.opponent }}</strong> ({{ nextClubFixture.isHome ? 'Home' : 'Away' }})
            </div>
          </v-card>
        </v-col>

        <!-- Owner Director's Box -->
        <v-col cols="12" sm="6" md="4">
          <v-card variant="tonal" color="blue-grey-darken-4" class="pa-2 px-3 rounded-lg">
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="text-caption font-weight-bold text-teal-lighten-3">
                <v-icon size="small" class="mr-1">mdi-domain</v-icon> DIRECTOR'S BOX
              </span>
              <v-btn
                size="x-small"
                variant="text"
                color="teal-lighten-3"
                :to="`/u/clubs/${userClub._id}/${userClub.ClubCode}?tab=4`"
              >
                Finances <v-icon size="x-small">mdi-chevron-right</v-icon>
              </v-btn>
            </div>
            <div class="d-flex align-center justify-space-between text-caption">
              <div>
                <span class="text-medium-emphasis">Treasury: </span>
                <strong class="text-success">{{ clubBudgetFormatted }}</strong>
              </div>
              <div>
                <span class="text-medium-emphasis">Wage: </span>
                <strong class="text-white">{{ clubWageBillFormatted }}/wk</strong>
              </div>
              <div>
                <span class="text-medium-emphasis">Stadium: </span>
                <strong class="text-white">Lvl {{ userClub.Finances?.stadiumLevel ?? 1 }}</strong>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-card>

    <v-card
      v-else
      class="mb-4 pa-3 elevation-1 border"
      color="indigo-darken-4"
    >
      <div class="d-flex justify-space-between align-center">
        <div class="d-flex align-center gap-2">
          <v-icon color="indigo-lighten-3">mdi-shield-account</v-icon>
          <span class="text-subtitle-2 text-white">
            Autonomous World Active &bull; Day {{ calendar?.CurrentDay ?? 1 }}
          </span>
        </div>
        <v-btn size="small" variant="tonal" color="white" to="/u/lobby">
          Enter Game Lobby
        </v-btn>
      </div>
    </v-card>

    <!-- World Feed: What Happened in the Meantime -->
    <world-feed-ticker />

    <!-- Main Fixture Center & Standings -->
    <v-row>
      <v-col cols="12" lg="8">
        <!-- Fixtures and next matches -->
        <v-card color="transparent">
          <v-sheet width="100%" color="indigo" class="rounded-t-lg overflow-hidden">
            <div class="text-center" v-if="selectedDay">
              <template v-if="!selectedDay.isFree && selectedDay.Matches?.length">
                <v-row class="px-2 py-2">
                  <v-col cols="12" md="6">
                    <fixture-card
                      :Match="selectedMatch || selectedDay.Matches[0]"
                    ></fixture-card>
                  </v-col>

                  <v-col cols="12" md="6">
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
                <v-card color="grey-darken-4" height="220px" class="d-flex align-center justify-center">
                  <v-card-text>
                    <v-icon size="large" class="mb-2">mdi-soccer</v-icon>
                    <div class="text-subtitle-1">No matches scheduled on Day {{ selectedDay.Day }}</div>
                    <div class="text-caption text-medium-emphasis">Scrub past or future days using the calendar below</div>
                  </v-card-text>
                </v-card>
              </template>
            </div>
          </v-sheet>

          <!-- Fixtures calendar scroller (Past and Upcoming) -->
          <v-sheet width="100%" color="dark" class="mt-2 rounded-b-lg pa-2">
            <div class="d-flex align-center justify-space-between px-2 mb-1">
              <span class="text-caption font-weight-bold text-medium-emphasis">
                GLOBAL CALENDAR: SCRUB PAST RESULTS & UPCOMING MATCHES
              </span>
              <div>
                <v-btn
                  variant="text"
                  size="small"
                  color="indigo-lighten-2"
                  to="/u/friendly"
                >
                  Play Friendly
                </v-btn>
                <v-btn
                  variant="text"
                  size="small"
                  color="indigo-lighten-2"
                  to="/u/fixtures"
                >
                  View All
                </v-btn>
              </div>
            </div>
            <v-col cols="12" class="pa-0">
              <day-scroll
                v-model="selectedDayIndex"
                :days="days"
                :singleLeague="false"
                @selected-day-index-changed="selectDay"
              ></day-scroll>
            </v-col>
          </v-sheet>
        </v-card>

        <!-- My competitions: one tab per active entry -->
        <v-card class="mt-4">
          <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center justify-space-between">
            <span>My Competitions</span>
            <v-btn size="x-small" variant="tonal" color="indigo-lighten-2" to="/u/competitions">
              Find competitions
            </v-btn>
          </v-card-title>
          <v-divider />
          <template v-if="runningEntries.length">
            <v-tabs v-model="seasonTab" bg-color="surface" show-arrows>
              <v-tab v-for="en in runningEntries" :key="en.seasonId" :value="en.seasonId">
                {{ en.edition.title }}
              </v-tab>
            </v-tabs>
            <v-window v-model="seasonTab">
              <v-window-item v-for="en in runningEntries" :key="en.seasonId" :value="en.seasonId" class="pa-3">
                <edition-standings
                  :edition-id="en.seasonId"
                  :definition="en.edition.definition"
                  :current-stage="en.edition.currentStage"
                  :status="en.edition.status"
                  :highlight-club-id="openPlay.clubId"
                  compact
                />
                <div class="text-right mt-2">
                  <v-btn size="small" variant="text" :to="`/u/competitions/${en.seasonId}`">Open</v-btn>
                </div>
              </v-window-item>
            </v-window>
          </template>
          <div v-else class="pa-4 text-medium-emphasis text-caption text-center">
            <template v-if="openPlay.activeEntries.length">
              Your competitions haven't started yet.
            </template>
            <template v-else>
              You're not in any competition.
              <router-link to="/u/competitions">See what's open for entry</router-link>.
            </template>
          </div>
        </v-card>
      </v-col>

      <!-- Right Column: Season Stats & Quick Navigation -->
      <v-col cols="12" lg="4">
        <v-card class="mb-4">
          <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
            Challenges
            <v-spacer />
            <v-btn
              size="small"
              color="teal"
              variant="flat"
              prepend-icon="mdi-sword-cross"
              :disabled="!openPlay.clubId"
              @click="challengeDialog = true"
            >
              Challenge
            </v-btn>
          </v-card-title>
          <v-divider />
          <v-card-text class="pa-2">
            <challenge-inbox max-height="360px" />
          </v-card-text>
        </v-card>

        <performance-card :performance="openPlay.performance" class="mb-4" />

        <!-- World Quick Shortcuts -->
        <v-card>
          <v-card-title class="text-subtitle-1 font-weight-bold">
            Autonomous Hub
          </v-card-title>
          <v-divider />
          <v-list density="compact">
            <v-list-item
              v-if="userClub"
              :to="`/u/clubs/${userClub._id}/${userClub.ClubCode}?tab=1`"
              prepend-icon="mdi-soccer-field"
              title="Pitch & Tactics"
              subtitle="Adjust formation, roles & match readiness"
            />
            <v-list-item
              v-if="userClub"
              :to="`/u/clubs/${userClub._id}/${userClub.ClubCode}?tab=4`"
              prepend-icon="mdi-cash-multiple"
              title="Director's Box"
              subtitle="Manage stadium expansion & club treasury"
            />
            <v-list-item
              v-if="userClub"
              :to="`/u/clubs/${userClub._id}/${userClub.ClubCode}?tab=5`"
              prepend-icon="mdi-swap-horizontal"
              title="Transfer Market"
              subtitle="Scout and sign players in the world"
            />
            <v-list-item
              to="/u/competitions"
              prepend-icon="mdi-trophy-outline"
              title="Competitions"
              subtitle="Enter competitions that fit your Level"
            />
            <v-list-item
              to="/u/calendar"
              prepend-icon="mdi-calendar-multiselect"
              title="Year Calendar"
              subtitle="Monthly grid of played and accepted matches"
            />
            <v-list-item
              to="/u/fixtures"
              prepend-icon="mdi-calendar-month"
              title="Complete Fixtures Schedule"
              subtitle="Inspect all rounds and watch replays"
            />
          </v-list>
        </v-card>
      </v-col>
    </v-row>
    <challenge-dialog v-model="challengeDialog" />
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@/store';
import DayScroll from '@/components/calendar/day-scroll.vue';
import EditionStandings from '@/components/open-play/edition-standings.vue';
import ChallengeInbox from '@/components/open-play/challenge-inbox.vue';
import ChallengeDialog from '@/components/open-play/challenge-dialog.vue';
import PerformanceCard from '@/components/open-play/performance-card.vue';
import LevelBadge from '@/components/open-play/level-badge.vue';
import YearProgress from '@/components/open-play/year-progress.vue';
import { useOpenPlayStore } from '@/store/open-play';
import { useClubDirectory } from '@/helpers/open-play';
import FixtureCard from '@/components/user-dashboard/fixture-card.vue';
import DayFixturesList from '@/components/user-dashboard/day-fixtures-list.vue';
import WorldFeedTicker from '@/components/user-dashboard/world-feed-ticker.vue';
import { client } from '@/services/api';
import { groupFixturesByDay } from '@/helpers/calendar';
import type { Fixture } from '@repo/api-contract';

const router = useRouter();
const store = useStore();
const openPlay = useOpenPlayStore();
const directory = useClubDirectory();
const challengeDialog = ref(false);

defineOptions({
  name: 'UserDashboard',
});

const selectedDayIndex = ref(0);
const seasonTab = ref<string | null>(null);
const selectedMatch = ref<Fixture | null>(null);
const days = ref<any>([]);

const runningEntries = computed(() =>
  openPlay.activeEntries.filter((e) => ['running', 'finished'].includes(e.edition.status))
);
const clubInfo = computed(() => directory.get(openPlay.clubId));

const calendar = computed(() => store.calendar);
const currentDay = computed(() => store.calendar?.CurrentDay);
const lobby = computed(() => store.lobby);
const formattedGameDate = computed(() =>
  calendar.value?.CurrentDate
    ? new Date(calendar.value.CurrentDate).toDateString()
    : ''
);

const selectedDay = computed(() => days.value[selectedDayIndex.value]);

const userClub = computed<any>(() => {
  const clubs = store.user?.clubs;
  if (Array.isArray(clubs) && clubs.length > 0 && typeof clubs[0] !== 'string') {
    return clubs[0];
  }
  return null;
});

const avgSquadFitness = computed(() => {
  if (!userClub.value?.Players?.length) return 100;
  const total = userClub.value.Players.reduce((acc: number, p: any) => {
    return acc + (p.Fitness?.matchReadiness ?? 100);
  }, 0);
  return Math.round(total / userClub.value.Players.length);
});

const injuredCount = computed(() => {
  if (!userClub.value?.Players?.length) return 0;
  return userClub.value.Players.filter((p: any) => p.Injury?.isInjured).length;
});

const clubBudgetFormatted = computed(() => {
  const b = userClub.value?.Finances?.budget ?? 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(b);
});

const clubWageBillFormatted = computed(() => {
  const w = userClub.value?.Finances?.wageBillWeekly ?? 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(w);
});

const nextClubFixture = computed(() => {
  if (!userClub.value) return null;
  const clubCode = userClub.value.ClubCode;
  const cur = currentDay.value ?? 0;
  for (const d of days.value) {
    if (d.Day >= cur && d.Matches) {
      const match = d.Matches.find(
        (m: any) => (m.Home === clubCode || m.Away === clubCode) && !m.Played
      );
      if (match) {
        const isHome = match.Home === clubCode;
        const opponent = isHome ? match.Away : match.Home;
        return {
          ...match,
          day: d.Day,
          isHome,
          opponent,
        };
      }
    }
  }
  return null;
});

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

function matchSelected(match: Fixture) {
  selectedMatch.value = match;
}

async function getDays() {
  const cur = currentDay.value ?? 0;
  const from = Math.max(0, cur - 7);
  const to = cur + 14;

  try {
    const response = await client.fixtures.getFixtures.query({
      query: { scheduledDayFrom: from, scheduledDayTo: to, light: true },
    });
    if (response.status === 200) {
      days.value = groupFixturesByDay(response.body.payload);
      const todayIndex = days.value.findIndex((d: any) => d.Day === cur);
      if (todayIndex !== -1) {
        selectedDayIndex.value = todayIndex;
      } else {
        const nextClosest = days.value.findIndex((d: any) => d.Day >= cur);
        selectedDayIndex.value = nextClosest !== -1 ? nextClosest : 0;
      }
    }
  } catch (error) {
    console.error('Error getting upcoming fixtures:', error);
  }
}

function selectDay(val: number) {
  selectedDayIndex.value = val;
  selectedMatch.value = null;
}

onMounted(async () => {
  openPlay.start();
  if (!store.user?.clubs?.[0] || typeof store.user?.clubs?.[0] === 'string') {
    await store.setUserClubs();
  }
});
onUnmounted(() => openPlay.stop());
</script>
