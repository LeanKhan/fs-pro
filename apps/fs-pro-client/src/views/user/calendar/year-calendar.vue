<template>
  <div class="year-calendar-container pa-4">
    <!-- 1. Header Banner -->
    <v-card class="elevation-3 rounded-lg mb-4 bg-surface border">
      <div class="d-flex flex-wrap align-center justify-space-between pa-4 gap-3">
        <!-- Title & Subtitle -->
        <div>
          <div class="d-flex align-center gap-2 mb-1 flex-wrap">
            <v-icon color="indigo-lighten-2" size="large">mdi-calendar-multiselect</v-icon>
            <span class="text-h5 font-weight-bold text-white">Season Calendar</span>
            <v-chip color="indigo" size="small" variant="tonal" class="font-weight-bold">
              {{ currentYearLabel }}
            </v-chip>
            <v-chip
              v-if="calendar"
              color="amber"
              size="small"
              variant="flat"
              class="font-weight-bold text-black"
            >
              Day {{ calendar.CurrentDay }} • {{ formattedTodayDate }}
            </v-chip>
          </div>
          <div class="text-caption text-medium-emphasis">
            Explore fixtures, review historical match outcomes, track milestones, and inspect all matchdays across the world.
          </div>
        </div>

        <!-- Controls: Filters, View Toggle, Today Jump & Admin Sim -->
        <div class="d-flex align-center gap-2 flex-wrap">
          <!-- Jump to Today -->
          <v-btn
            color="amber"
            variant="tonal"
            size="small"
            prepend-icon="mdi-calendar-today"
            @click="jumpToToday"
            title="Jump to current in-game day"
          >
            Today
          </v-btn>

          <!-- Fixture Scope Filter: All vs My Club -->
          <v-btn-toggle
            v-model="fixtureFilter"
            mandatory
            density="compact"
            color="primary"
            class="elevation-1"
          >
            <v-btn value="all" size="small">
              <v-icon size="small" class="mr-1">mdi-earth</v-icon>
              All Matches
            </v-btn>
            <v-btn value="club" size="small" :disabled="!userClub">
              <v-icon size="small" class="mr-1">mdi-shield</v-icon>
              My Club
            </v-btn>
          </v-btn-toggle>

          <!-- View Mode Toggle: Grid vs List -->
          <v-btn-toggle
            v-model="viewMode"
            mandatory
            density="compact"
            color="indigo-lighten-1"
            class="elevation-1"
          >
            <v-btn value="grid" size="small" icon="mdi-view-grid-outline" title="Month Grid View" />
            <v-btn value="list" size="small" icon="mdi-format-list-bulleted" title="Schedule List View" />
          </v-btn-toggle>

          <!-- Admin Fast-Forward / Sim to Date -->
          <v-btn
            color="purple-accent-3"
            variant="tonal"
            size="small"
            prepend-icon="mdi-fast-forward"
            @click="openSimToDateModal()"
            title="Fast forward simulation to target date"
          >
            Sim to Date
          </v-btn>
        </div>
      </div>

      <v-divider />

      <!-- Season Overview Stats Strip -->
      <div class="px-4 py-2 bg-surface-variant d-flex align-center justify-space-between flex-wrap gap-3 text-caption">
        <div class="d-flex align-center gap-4 flex-wrap">
          <div>
            <span class="text-medium-emphasis">Total Matches: </span>
            <span class="font-weight-bold text-white">{{ allFixtures.length }}</span>
          </div>
          <div>
            <span class="text-medium-emphasis">Played: </span>
            <span class="font-weight-bold text-success">{{ playedCount }}</span>
          </div>
          <div>
            <span class="text-medium-emphasis">Remaining: </span>
            <span class="font-weight-bold text-amber">{{ remainingCount }}</span>
          </div>
          <div v-if="userClub">
            <span class="text-medium-emphasis">{{ userClub.Name }} Record: </span>
            <span class="font-weight-bold text-success">{{ clubRecord.wins }}W</span>
            <span class="mx-1">•</span>
            <span class="font-weight-bold text-amber">{{ clubRecord.draws }}D</span>
            <span class="mx-1">•</span>
            <span class="font-weight-bold text-error">{{ clubRecord.losses }}L</span>
            <span class="ml-2 font-weight-bold text-indigo-lighten-3">({{ clubRecord.points }} pts)</span>
          </div>
        </div>

        <div class="d-flex align-center gap-2">
          <span class="text-medium-emphasis">Active Competition:</span>
          <v-chip size="x-small" color="primary" variant="outlined">{{ activeCompetitionName }}</v-chip>
        </div>
      </div>
    </v-card>

    <!-- Loading State -->
    <div v-if="loading" class="text-center pa-12">
      <v-progress-circular indeterminate color="indigo" size="64" />
      <div class="text-subtitle-1 text-medium-emphasis mt-3">Loading Year Calendar & Fixtures...</div>
    </div>

    <template v-else>
      <!-- 2. Month Navigator Bar -->
      <v-card class="elevation-2 rounded-lg mb-4 bg-surface border">
        <div class="d-flex align-center justify-space-between pa-3 flex-wrap gap-2">
          <!-- Prev / Next Month Nav -->
          <div class="d-flex align-center gap-2">
            <v-btn
              icon="mdi-chevron-left"
              variant="text"
              size="small"
              :disabled="activeMonthIndex <= 0"
              @click="activeMonthIndex--"
            />
            <span class="text-h6 font-weight-bold text-white px-2">
              {{ activeMonthName }}
            </span>
            <v-btn
              icon="mdi-chevron-right"
              variant="text"
              size="small"
              :disabled="activeMonthIndex >= availableMonths.length - 1"
              @click="activeMonthIndex++"
            />
          </div>

          <!-- Quick Month Selector Pills -->
          <div class="d-flex align-center gap-1 overflow-x-auto py-1">
            <v-chip
              v-for="(m, idx) in availableMonths"
              :key="m.key"
              size="small"
              :color="idx === activeMonthIndex ? 'primary' : undefined"
              :variant="idx === activeMonthIndex ? 'flat' : 'tonal'"
              class="cursor-pointer font-weight-medium"
              @click="activeMonthIndex = idx"
            >
              {{ m.shortLabel }}
              <v-badge
                v-if="m.hasToday"
                dot
                color="amber"
                inline
                class="ml-1"
              />
            </v-chip>
          </div>
        </div>
      </v-card>

      <!-- 3. VIEW MODE A: Month Grid View -->
      <v-card v-if="viewMode === 'grid'" class="elevation-2 rounded-lg bg-surface border pa-3">
        <!-- Weekday Headers -->
        <div class="calendar-grid-header">
          <div v-for="dayName in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="dayName" class="grid-header-cell">
            {{ dayName }}
          </div>
        </div>

        <!-- Days Grid -->
        <div class="calendar-grid">
          <div
            v-for="(cell, i) in currentMonthCells"
            :key="i"
            :class="[
              'calendar-day-cell',
              {
                'empty-cell': !cell.date,
                'is-today': cell.isToday,
                'has-matches': cell.matches.length > 0,
                'is-past': cell.isPast,
                'is-future': cell.isFuture,
                'has-user-club': cell.hasUserClub,
              }
            ]"
            @click="cell.date ? openDayDetails(cell) : null"
          >
            <template v-if="cell.date">
              <!-- Cell Header: Date Number & Badges -->
              <div class="day-cell-top d-flex align-center justify-space-between">
                <span class="day-number" :class="{ 'text-amber font-weight-black': cell.isToday }">
                  {{ cell.dayOfMonth }}
                </span>

                <div class="d-flex align-center gap-1">
                  <v-chip
                    v-if="cell.gameDay != null"
                    size="x-small"
                    :color="cell.isToday ? 'amber' : 'grey-darken-1'"
                    :variant="cell.isToday ? 'flat' : 'tonal'"
                    class="px-1 text-black font-weight-bold"
                  >
                    D{{ cell.gameDay }}
                  </v-chip>
                  <v-chip
                    v-if="cell.isToday"
                    size="x-small"
                    color="amber"
                    variant="flat"
                    class="px-1 font-weight-black text-black"
                  >
                    TODAY
                  </v-chip>
                </div>
              </div>

              <!-- Matches List within Cell -->
              <div class="cell-matches-container">
                <div
                  v-for="(fixture, fIdx) in cell.matches.slice(0, 2)"
                  :key="fIdx"
                  :class="[
                    'match-mini-pill',
                    getMatchResultClass(fixture),
                    { 'is-my-club-match': isClubInFixture(fixture) }
                  ]"
                  :title="`${fixture.Home} vs ${fixture.Away} - ${fixture.Played ? fixture.Details?.FullTimeScore : 'Scheduled'}`"
                >
                  <span class="match-teams text-truncate">
                    <span :class="{ 'font-weight-bold text-white': fixture.Home === userClubCode }">
                      {{ fixture.Home }}
                    </span>
                    <span class="mx-1 text-medium-emphasis">
                      {{ fixture.Played ? (fixture.Details?.FullTimeScore || 'FT') : 'vs' }}
                    </span>
                    <span :class="{ 'font-weight-bold text-white': fixture.Away === userClubCode }">
                      {{ fixture.Away }}
                    </span>
                  </span>
                </div>

                <!-- More Matches Indicator -->
                <div v-if="cell.matches.length > 2" class="more-matches-label">
                  +{{ cell.matches.length - 2 }} more
                </div>

                <!-- Non-match events indicator -->
                <div v-if="cell.events.length > 0" class="event-mini-pill">
                  <v-icon size="x-small" color="purple-lighten-3" class="mr-1">mdi-bell-outline</v-icon>
                  <span class="text-truncate">{{ cell.events[0].title || 'Event' }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </v-card>

      <!-- 4. VIEW MODE B: Schedule List View -->
      <v-card v-else class="elevation-2 rounded-lg bg-surface border pa-4">
        <div class="d-flex align-center justify-space-between mb-3">
          <span class="text-subtitle-1 font-weight-bold text-white">
            {{ activeMonthName }} Fixtures Schedule
          </span>
          <span class="text-caption text-medium-emphasis">
            {{ currentMonthFixtures.length }} match(es) scheduled
          </span>
        </div>

        <div v-if="currentMonthFixtures.length === 0" class="text-center pa-8 text-medium-emphasis">
          <v-icon size="large" class="mb-2">mdi-calendar-blank</v-icon>
          <div>No fixtures scheduled for this month under the active filter.</div>
        </div>

        <v-list v-else density="comfortable" class="bg-transparent pa-0">
          <v-card
            v-for="fixture in currentMonthFixtures"
            :key="fixture._id"
            class="mb-3 pa-3 rounded-lg border bg-surface-variant cursor-pointer hover-card"
            @click="openFixtureModal(fixture)"
          >
            <div class="d-flex align-center justify-space-between flex-wrap gap-2">
              <!-- Left: Date & Competition Badge -->
              <div class="d-flex align-center gap-2">
                <v-chip size="small" color="indigo" variant="tonal" class="font-weight-bold">
                  Day {{ fixture.ScheduledDay }}
                </v-chip>
                <span class="text-caption text-medium-emphasis">
                  {{ formatFixtureDate(fixture.ScheduledDate) }}
                </span>
                <v-chip size="x-small" color="grey" variant="outlined">
                  {{ fixture.LeagueCode }}
                </v-chip>
              </div>

              <!-- Center: Clubs & Score -->
              <div class="d-flex align-center gap-3">
                <span
                  class="text-subtitle-2 font-weight-bold text-right"
                  :class="{ 'text-amber': fixture.Home === userClubCode }"
                  style="min-width: 90px"
                >
                  {{ fixture.Home }}
                </span>

                <v-chip
                  size="small"
                  :color="fixture.Played ? 'success' : 'grey-darken-2'"
                  variant="flat"
                  class="font-weight-black px-2"
                >
                  {{ fixture.Played ? (fixture.Details?.FullTimeScore || 'Played') : 'Upcoming' }}
                </v-chip>

                <span
                  class="text-subtitle-2 font-weight-bold"
                  :class="{ 'text-amber': fixture.Away === userClubCode }"
                  style="min-width: 90px"
                >
                  {{ fixture.Away }}
                </span>
              </div>

              <!-- Right: Actions -->
              <div class="d-flex align-center gap-2">
                <v-btn
                  v-if="fixture.Played"
                  size="x-small"
                  color="amber"
                  variant="tonal"
                  prepend-icon="mdi-clipboard-text-outline"
                  :to="`/matchzone/${fixture._id}`"
                  @click.stop
                >
                  Review
                </v-btn>
                <v-btn
                  v-else-if="fixture.ScheduledDay === calendar?.CurrentDay && isClubInFixture(fixture)"
                  size="x-small"
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-play"
                  :to="`/matchzone/${fixture._id}`"
                  @click.stop
                >
                  Play
                </v-btn>
                <v-icon size="small" color="grey">mdi-chevron-right</v-icon>
              </div>
            </div>
          </v-card>
        </v-list>
      </v-card>
    </template>

    <!-- 5. Day Match Center Modal (Click on any day cell) -->
    <v-dialog v-model="showDayModal" max-width="650px">
      <v-card v-if="selectedDayCell" class="pa-4 bg-surface elevation-6 rounded-lg border">
        <!-- Dialog Header -->
        <div class="d-flex align-center justify-space-between mb-2">
          <div>
            <div class="d-flex align-center gap-2">
              <span class="text-h6 font-weight-bold text-white">
                {{ selectedDayCell.formattedDate }}
              </span>
              <v-chip
                v-if="selectedDayCell.gameDay != null"
                size="small"
                :color="selectedDayCell.isToday ? 'amber' : 'indigo'"
                variant="flat"
                class="font-weight-bold text-black"
              >
                Day {{ selectedDayCell.gameDay }}
              </v-chip>
              <v-chip
                v-if="selectedDayCell.isToday"
                size="small"
                color="amber"
                variant="flat"
                class="font-weight-black text-black"
              >
                TODAY
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ selectedDayCell.matches.length }} match(es) scheduled on this day
            </div>
          </div>

          <v-btn icon="mdi-close" variant="text" size="small" @click="showDayModal = false" />
        </div>

        <v-divider class="mb-3" />

        <!-- Fixtures List -->
        <div v-if="selectedDayCell.matches.length === 0" class="text-center pa-6 text-medium-emphasis">
          <v-icon size="large" class="mb-2">mdi-coffee-outline</v-icon>
          <div>No matches scheduled on this day. (Rest / Training Day)</div>
        </div>

        <v-list v-else density="compact" class="bg-transparent pa-0">
          <v-card
            v-for="fixture in selectedDayCell.matches"
            :key="fixture._id"
            class="pa-3 mb-2 rounded border bg-surface-variant"
          >
            <div class="d-flex align-center justify-space-between flex-wrap gap-2">
              <!-- Teams & Score -->
              <div class="d-flex align-center gap-3">
                <span
                  class="font-weight-bold"
                  :class="{ 'text-amber': fixture.Home === userClubCode, 'text-white': fixture.Home !== userClubCode }"
                >
                  {{ fixture.Home }}
                </span>

                <v-chip
                  size="small"
                  :color="fixture.Played ? 'success' : 'grey-darken-2'"
                  variant="flat"
                  class="font-weight-black"
                >
                  {{ fixture.Played ? (fixture.Details?.FullTimeScore || 'FT') : 'Scheduled' }}
                </v-chip>

                <span
                  class="font-weight-bold"
                  :class="{ 'text-amber': fixture.Away === userClubCode, 'text-white': fixture.Away !== userClubCode }"
                >
                  {{ fixture.Away }}
                </span>
              </div>

              <!-- Venue / Competition info -->
              <div class="text-caption text-medium-emphasis">
                {{ fixture.Stadium || fixture.LeagueCode }}
              </div>

              <!-- Action Link -->
              <div>
                <v-btn
                  v-if="fixture.Played"
                  size="small"
                  color="amber"
                  variant="tonal"
                  prepend-icon="mdi-clipboard-text-outline"
                  :to="`/matchzone/${fixture._id}`"
                  @click="showDayModal = false"
                >
                  Match Review
                </v-btn>
                <v-btn
                  v-else-if="fixture.ScheduledDay === calendar?.CurrentDay && isClubInFixture(fixture)"
                  size="small"
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-play"
                  :to="`/matchzone/${fixture._id}`"
                  @click="showDayModal = false"
                >
                  Play Match
                </v-btn>
              </div>
            </div>
          </v-card>
        </v-list>

        <!-- Admin Sim to this Day Action Button -->
        <div
          v-if="selectedDayCell.isFuture && selectedDayCell.gameDay != null"
          class="mt-4 pt-3 border-t d-flex justify-space-between align-center"
        >
          <div class="text-caption text-medium-emphasis">
            Fast-forward simulation up to this day:
          </div>
          <v-btn
            color="purple-accent-3"
            variant="tonal"
            size="small"
            prepend-icon="mdi-fast-forward"
            @click="triggerSimToDay(selectedDayCell.gameDay)"
          >
            Sim to Day {{ selectedDayCell.gameDay }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- 6. Admin Sim to Date Dialog -->
    <v-dialog v-model="showSimModal" max-width="500px">
      <v-card class="pa-4 bg-surface elevation-6 rounded-lg border">
        <div class="d-flex align-center justify-space-between mb-3">
          <div class="d-flex align-center gap-2">
            <v-icon color="purple-accent-3">mdi-fast-forward</v-icon>
            <span class="text-h6 font-weight-bold text-white">Simulate to Date</span>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showSimModal = false" />
        </div>

        <p class="text-caption text-medium-emphasis mb-3">
          Batch simulate all scheduled fixtures and advance the calendar sequentially to the selected target day or date. Player fitness and injuries will update realistically.
        </p>

        <!-- Current Status -->
        <div class="pa-3 mb-3 rounded bg-surface-variant border d-flex justify-space-between align-center text-caption">
          <div>
            <span class="text-medium-emphasis">Current: </span>
            <span class="font-weight-bold text-amber">Day {{ calendar?.CurrentDay }}</span>
          </div>
          <div>
            <span class="text-medium-emphasis">Date: </span>
            <span class="font-weight-bold text-white">{{ formattedTodayDate }}</span>
          </div>
        </div>

        <!-- Target Day Input -->
        <v-text-field
          v-model.number="simTargetDay"
          type="number"
          label="Target Day Number"
          :min="(calendar?.CurrentDay ?? 1) + 1"
          density="comfortable"
          variant="outlined"
          prepend-inner-icon="mdi-calendar-clock"
          hint="Sequential calendar day to advance to"
          persistent-hint
          class="mb-3"
        />

        <!-- Presets -->
        <div class="text-caption font-weight-bold text-medium-emphasis mb-1">Quick Presets:</div>
        <div class="d-flex gap-2 mb-4 flex-wrap">
          <v-btn
            size="x-small"
            variant="tonal"
            color="primary"
            @click="setSimTargetOffset(1)"
          >
            +1 Day
          </v-btn>
          <v-btn
            size="x-small"
            variant="tonal"
            color="primary"
            @click="setSimTargetOffset(7)"
          >
            +1 Week (7 Days)
          </v-btn>
          <v-btn
            size="x-small"
            variant="tonal"
            color="primary"
            @click="setSimTargetOffset(14)"
          >
            +2 Weeks
          </v-btn>
          <v-btn
            size="x-small"
            variant="tonal"
            color="indigo-lighten-2"
            @click="setSimTargetToEndOfMonth()"
          >
            End of Month
          </v-btn>
        </div>

        <v-divider class="mb-3" />

        <div class="d-flex justify-end gap-2">
          <v-btn variant="text" size="small" @click="showSimModal = false">
            Cancel
          </v-btn>
          <v-btn
            color="purple-accent-3"
            variant="flat"
            size="small"
            :loading="simulating"
            :disabled="simulating || !simTargetDay || simTargetDay <= (calendar?.CurrentDay ?? 1)"
            @click="executeSimToDate"
          >
            Simulate Now
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Feedback Toast -->
    <v-snackbar v-model="toast.show" :color="toast.color" :timeout="4000">
      {{ toast.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useStore } from '@/store';
import { client } from '@/services/api';
import type { Fixture } from '@repo/api-contract';

const store = useStore();

const loading = ref(true);
const simulating = ref(false);
const allFixtures = ref<Fixture[]>([]);
const fixtureFilter = ref<'all' | 'club'>('all');
const viewMode = ref<'grid' | 'list'>('grid');
const activeMonthIndex = ref(0);

// Modal state
const showDayModal = ref(false);
const selectedDayCell = ref<any>(null);
const showSimModal = ref(false);
const simTargetDay = ref<number>(10);

const toast = ref({
  show: false,
  color: 'success',
  message: '',
});

const calendar = computed(() => store.calendar);
const user = computed(() => store.user);

const userClub = computed<any>(() => {
  const clubs = user.value?.clubs;
  if (Array.isArray(clubs) && clubs.length > 0 && typeof clubs[0] !== 'string') {
    return clubs[0];
  }
  return null;
});

const userClubCode = computed(() => userClub.value?.ClubCode || '');

const currentYearLabel = computed(() => {
  const season = store.seasons?.[0] as any;
  if (season?.Year) return season.Year;
  const curDate = calendar.value?.CurrentDate;
  if (curDate) {
    const y = new Date(curDate).getFullYear();
    return `${y}/${(y + 1).toString().slice(-2)}`;
  }
  return '2026/27';
});

const formattedTodayDate = computed(() => {
  const cur = calendar.value?.CurrentDate;
  if (cur) {
    const d = new Date(cur);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return 'Day 1';
});

const activeCompetitionName = computed(() => {
  return userClub.value?.LeagueCode || 'Premier Division';
});

function isClubInFixture(fixture: Fixture): boolean {
  if (!userClubCode.value) return false;
  return fixture.Home === userClubCode.value || fixture.Away === userClubCode.value;
}

// Filtered fixtures based on All vs My Club
const filteredFixtures = computed(() => {
  if (fixtureFilter.value === 'club' && userClubCode.value) {
    return allFixtures.value.filter((f) => isClubInFixture(f));
  }
  return allFixtures.value;
});

const playedCount = computed(() => {
  return filteredFixtures.value.filter((f) => f.Played).length;
});

const remainingCount = computed(() => {
  return filteredFixtures.value.filter((f) => !f.Played).length;
});

const clubRecord = computed(() => {
  if (!userClubCode.value) return { wins: 0, draws: 0, losses: 0, points: 0 };
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const f of allFixtures.value) {
    if (!f.Played || !isClubInFixture(f) || !f.Details) continue;
    if (f.Details.Draw) {
      draws++;
    } else if (f.Details.Winner === userClubCode.value) {
      wins++;
    } else {
      losses++;
    }
  }

  return { wins, draws, losses, points: wins * 3 + draws };
});

interface MonthMeta {
  key: string; // "YYYY-MM"
  year: number;
  month: number; // 0-11
  label: string; // "September 2026"
  shortLabel: string; // "Sep"
  hasToday: boolean;
}

// Available months computed from scheduled dates of fixtures
const availableMonths = computed<MonthMeta[]>(() => {
  const map = new Map<string, MonthMeta>();

  const curDate = calendar.value?.CurrentDate ? new Date(calendar.value.CurrentDate) : new Date();
  const curKey = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}`;

  // Always include current calendar date's month
  map.set(curKey, {
    key: curKey,
    year: curDate.getFullYear(),
    month: curDate.getMonth(),
    label: curDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    shortLabel: curDate.toLocaleDateString('en-US', { month: 'short' }),
    hasToday: true,
  });

  for (const f of allFixtures.value) {
    if (!f.ScheduledDate) continue;
    const d = new Date(f.ScheduledDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        shortLabel: d.toLocaleDateString('en-US', { month: 'short' }),
        hasToday: key === curKey,
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    return a.year !== b.year ? a.year - b.year : a.month - b.month;
  });
});

const activeMonth = computed(() => {
  return availableMonths.value[activeMonthIndex.value] || availableMonths.value[0];
});

const activeMonthName = computed(() => {
  return activeMonth.value?.label || '';
});

// Build 7-day grid cells for active month
const currentMonthCells = computed(() => {
  if (!activeMonth.value) return [];
  const { year, month } = activeMonth.value;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  // Convert Sunday-first (0) to Monday-first (0=Mon, 6=Sun)
  let startingDayOfWeek = (firstDay.getDay() + 6) % 7;

  const cells = [];

  // Empty leading cells
  for (let i = 0; i < startingDayOfWeek; i++) {
    cells.push({
      date: null,
      dayOfMonth: 0,
      matches: [],
      events: [],
      isToday: false,
      isPast: false,
      isFuture: false,
      hasUserClub: false,
      gameDay: null,
    });
  }

  const curCalendarDay = calendar.value?.CurrentDay ?? 1;
  const curDateStr = calendar.value?.CurrentDate
    ? new Date(calendar.value.CurrentDate).toDateString()
    : new Date().toDateString();

  // Day cells
  for (let d = 1; d <= totalDays; d++) {
    const cellDate = new Date(year, month, d);
    const cellDateStr = cellDate.toDateString();
    const isToday = cellDateStr === curDateStr;

    // Find matches matching this date
    const dayMatches = filteredFixtures.value.filter((f) => {
      if (!f.ScheduledDate) return false;
      return new Date(f.ScheduledDate).toDateString() === cellDateStr;
    });

    const gameDay = dayMatches.length > 0 ? dayMatches[0].ScheduledDay : null;
    const isPast = gameDay != null ? gameDay < curCalendarDay : cellDate < new Date(curDateStr);
    const isFuture = gameDay != null ? gameDay > curCalendarDay : cellDate > new Date(curDateStr);
    const hasUserClub = dayMatches.some((f) => isClubInFixture(f));

    cells.push({
      date: cellDate,
      dayOfMonth: d,
      formattedDate: cellDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      matches: dayMatches,
      events: [],
      isToday,
      isPast,
      isFuture,
      hasUserClub,
      gameDay,
    });
  }

  return cells;
});

// Fixtures for active month (for List View)
const currentMonthFixtures = computed(() => {
  if (!activeMonth.value) return [];
  const { year, month } = activeMonth.value;

  return filteredFixtures.value
    .filter((f) => {
      if (!f.ScheduledDate) return false;
      const d = new Date(f.ScheduledDate);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => (a.ScheduledDay ?? 0) - (b.ScheduledDay ?? 0));
});

function getMatchResultClass(fixture: Fixture): string {
  if (!fixture.Played || !fixture.Details) return 'match-upcoming';
  if (!userClubCode.value || !isClubInFixture(fixture)) return 'match-played';

  if (fixture.Details.Draw) return 'match-draw';
  if (fixture.Details.Winner === userClubCode.value) return 'match-win';
  return 'match-loss';
}

function formatFixtureDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function jumpToToday() {
  const curDate = calendar.value?.CurrentDate ? new Date(calendar.value.CurrentDate) : new Date();
  const curKey = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}`;
  const idx = availableMonths.value.findIndex((m) => m.key === curKey);
  if (idx !== -1) {
    activeMonthIndex.value = idx;
  }
}

function openDayDetails(cell: any) {
  selectedDayCell.value = cell;
  showDayModal.value = true;
}

function openFixtureModal(fixture: Fixture) {
  const cell = {
    date: fixture.ScheduledDate ? new Date(fixture.ScheduledDate) : new Date(),
    formattedDate: formatFixtureDate(fixture.ScheduledDate),
    matches: [fixture],
    gameDay: fixture.ScheduledDay,
    isToday: fixture.ScheduledDay === calendar.value?.CurrentDay,
    isFuture: (fixture.ScheduledDay ?? 0) > (calendar.value?.CurrentDay ?? 0),
  };
  openDayDetails(cell);
}

function openSimToDateModal() {
  simTargetDay.value = (calendar.value?.CurrentDay ?? 1) + 7;
  showSimModal.value = true;
}

function setSimTargetOffset(days: number) {
  simTargetDay.value = (calendar.value?.CurrentDay ?? 1) + days;
}

function setSimTargetToEndOfMonth() {
  simTargetDay.value = (calendar.value?.CurrentDay ?? 1) + 18;
}

function triggerSimToDay(day: number) {
  showDayModal.value = false;
  simTargetDay.value = day;
  showSimModal.value = true;
}

async function executeSimToDate() {
  if (!simTargetDay.value) return;
  simulating.value = true;

  try {
    const res = await client.calendar.simulateToDate.mutation({
      body: { targetDay: simTargetDay.value },
    });

    if (res.status === 200) {
      toast.value = {
        show: true,
        color: 'success',
        message: res.body.message || 'Simulation completed successfully!',
      };
      showSimModal.value = false;
      await store.setCalendar();
      await fetchFixtures();
    } else {
      toast.value = {
        show: true,
        color: 'error',
        message: res.body.message || 'Simulation encountered an error',
      };
    }
  } catch (err) {
    console.error('Error executing sim to date:', err);
    toast.value = {
      show: true,
      color: 'error',
      message: 'Failed to simulate to target date',
    };
  } finally {
    simulating.value = false;
  }
}

async function fetchFixtures() {
  loading.value = true;
  try {
    const response = await client.fixtures.getFixtures.query({});
    if (response.status === 200) {
      allFixtures.value = response.body.payload;
    }
  } catch (err) {
    console.error('Error fetching calendar fixtures:', err);
  } finally {
    loading.value = false;
    jumpToToday();
  }
}

onMounted(async () => {
  await store.setCalendar();
  await store.setSeasons();
  await fetchFixtures();
});
</script>

<style scoped>
.year-calendar-container {
  max-width: 1300px;
  margin: 0 auto;
  user-select: none;
}

.calendar-grid-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  margin-bottom: 6px;
  text-align: center;
}

.grid-header-cell {
  font-size: 0.78rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  padding: 6px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.calendar-day-cell {
  min-height: 105px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  transition: all 0.15s ease-in-out;
  cursor: pointer;
}

.calendar-day-cell:hover:not(.empty-cell) {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(129, 140, 248, 0.4);
  transform: translateY(-1px);
}

.calendar-day-cell.empty-cell {
  background: transparent;
  border-color: transparent;
  cursor: default;
}

.calendar-day-cell.is-today {
  border: 2px solid #f59e0b !important;
  background: rgba(245, 158, 11, 0.08) !important;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);
}

.calendar-day-cell.has-user-club {
  border-left: 3px solid #818cf8;
}

.day-number {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
}

.cell-matches-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  flex-grow: 1;
}

.match-mini-pill {
  font-size: 0.68rem;
  padding: 2px 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.match-mini-pill.match-upcoming {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
  color: #c7d2fe;
}

.match-mini-pill.match-played {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
  color: #cbd5e1;
}

.match-mini-pill.match-win {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.5);
  color: #86efac;
}

.match-mini-pill.match-loss {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fca5a5;
}

.match-mini-pill.match-draw {
  background: rgba(234, 179, 8, 0.2);
  border-color: rgba(234, 179, 8, 0.5);
  color: #fde047;
}

.more-matches-label {
  font-size: 0.65rem;
  color: #94a3b8;
  text-align: center;
  font-weight: 600;
}

.event-mini-pill {
  font-size: 0.65rem;
  color: #d8b4fe;
  background: rgba(168, 85, 247, 0.15);
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 4px;
  padding: 1px 4px;
  display: flex;
  align-items: center;
}

.hover-card:hover {
  border-color: rgba(129, 140, 248, 0.5);
  background: rgba(255, 255, 255, 0.06);
}
</style>
