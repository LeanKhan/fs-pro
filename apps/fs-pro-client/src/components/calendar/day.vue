<template>
  <v-card
    class="mx-2 pa-2 day-card cursor-pointer transition-swing"
    :class="{
      'day-today': isToday,
      'day-active': active,
      'day-past': isPast,
    }"
    :elevation="active ? 6 : (isToday ? 4 : 1)"
    rounded="lg"
    min-height="150px"
    width="210px"
    :style="cardStyle"
    @click="() => toggle()"
  >
    <!-- Top Bar: Day Number & Status Badges -->
    <div class="d-flex justify-space-between align-center mb-1">
      <div class="d-flex align-center gap-1">
        <span class="text-subtitle-2 font-weight-bold" :class="isToday ? 'text-green-accent-3' : 'text-white'">
          Day {{ day.Day }}
        </span>
        <v-chip
          v-if="isToday"
          size="x-small"
          color="success"
          variant="flat"
          class="font-weight-bold text-uppercase px-1 ml-1"
        >
          TODAY
        </v-chip>
      </div>

      <v-chip
        v-if="isPast"
        size="x-small"
        color="grey-darken-1"
        variant="tonal"
      >
        Played
      </v-chip>
      <v-chip
        v-else-if="!isToday"
        size="x-small"
        color="indigo-lighten-3"
        variant="tonal"
      >
        Upcoming
      </v-chip>
    </div>

    <v-divider class="mb-2" />

    <!-- Match Content -->
    <div v-if="day.Matches && day.Matches.length > 0" class="day-match-preview">
      <!-- Headline Match -->
      <div class="d-flex justify-space-between align-center px-1 mb-1">
        <div class="d-flex align-center gap-1">
          <v-avatar size="24">
            <v-icon size="20">custom:{{ primaryMatch.Home }}</v-icon>
          </v-avatar>
          <span class="text-caption font-weight-bold">{{ primaryMatch.Home }}</span>
        </div>

        <div class="text-center px-1">
          <template v-if="primaryMatch.Played && primaryMatch.Details">
            <span class="text-caption font-weight-bold text-amber-lighten-2">
              {{ primaryMatch.Details.HomeTeamScore }} : {{ primaryMatch.Details.AwayTeamScore }}
            </span>
          </template>
          <template v-else>
            <span class="text-caption text-medium-emphasis">vs</span>
          </template>
        </div>

        <div class="d-flex align-center gap-1">
          <span class="text-caption font-weight-bold">{{ primaryMatch.Away }}</span>
          <v-avatar size="24">
            <v-icon size="20">custom:{{ primaryMatch.Away }}</v-icon>
          </v-avatar>
        </div>
      </div>

      <!-- Match context / Club context -->
      <div v-if="clubMatchContext" class="text-caption text-center text-truncate mb-1">
        <v-chip size="x-small" :color="clubMatchContext.isHome ? 'primary' : 'teal'" variant="tonal">
          {{ clubMatchContext.label }}
        </v-chip>
      </div>
      <div v-else class="text-caption text-center text-medium-emphasis text-truncate mb-1">
        {{ primaryMatch.LeagueCode }} &bull; Week {{ primaryMatch.Week }}
      </div>

      <!-- Multiple matches footer / Dialog trigger -->
      <div class="d-flex justify-space-between align-center mt-1 pt-1 border-t">
        <span class="text-caption text-medium-emphasis">
          {{ day.Matches.length }} {{ day.Matches.length === 1 ? 'match' : 'matches' }}
        </span>

        <v-dialog v-model="dialog" scrollable max-width="500px">
          <template v-slot:activator="{ props }">
            <v-btn
              v-if="day.Matches.length > 1"
              size="x-small"
              variant="text"
              color="indigo-lighten-2"
              v-bind="props"
              @click.stop
            >
              +{{ day.Matches.length - 1 }} more
            </v-btn>
          </template>
          <v-card>
            <v-card-title class="text-subtitle-1 d-flex justify-space-between align-center">
              <span>Day {{ day.Day }} Fixtures ({{ day.Matches.length }})</span>
              <v-chip v-if="isToday" size="x-small" color="success">TODAY</v-chip>
            </v-card-title>
            <v-divider />
            <v-card-text style="max-height: 400px" class="pa-2">
              <v-list density="compact">
                <v-list-item
                  v-for="(m, i) in day.Matches"
                  :key="i"
                  class="py-1 px-2 my-1 rounded bg-surface-variant"
                >
                  <template #prepend>
                    <div class="d-flex align-center gap-1 mr-2" style="min-width: 80px">
                      <v-icon size="small">custom:{{ m.Home }}</v-icon>
                      <span class="text-caption font-weight-bold" :class="{'text-green-accent-3': m.Home === club}">
                        {{ m.Home }}
                      </span>
                    </div>
                  </template>
                  <v-list-item-title class="text-center text-caption font-weight-bold">
                    <span v-if="m.Played && m.Details" class="text-amber-accent-2 font-weight-black">
                      {{ m.Details.HomeTeamScore }} - {{ m.Details.AwayTeamScore }}
                    </span>
                    <span v-else class="text-medium-emphasis">vs</span>
                  </v-list-item-title>
                  <template #append>
                    <div class="d-flex align-center gap-1 ml-2" style="min-width: 80px; justify-content: flex-end">
                      <span class="text-caption font-weight-bold" :class="{'text-green-accent-3': m.Away === club}">
                        {{ m.Away }}
                      </span>
                      <v-icon size="small">custom:{{ m.Away }}</v-icon>
                    </div>
                    <v-btn
                      v-if="m.Played"
                      size="x-small"
                      variant="flat"
                      color="amber-accent-4"
                      class="ml-2 font-weight-bold text-black"
                      :to="`/matchzone/${m._id}`"
                      @click.stop
                    >
                      Review
                    </v-btn>
                    <v-chip v-else size="x-small" color="grey" variant="tonal" class="ml-2">
                      Upcoming
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card-text>
          </v-card>
        </v-dialog>
      </div>
    </div>

    <!-- Free / Rest Day -->
    <div v-else class="text-center py-3">
      <v-icon size="small" color="grey">mdi-calendar-blank-outline</v-icon>
      <div class="text-caption text-medium-emphasis mt-1">No Matches</div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '@/store';

interface Props {
  day: any;
  toggle: () => void;
  active: boolean;
  singleLeague: boolean;
  club?: string;
}

const props = defineProps<Props>();
const store = useStore();

const dialog = ref(false);

const currentDay = computed(() => store.calendar?.CurrentDay ?? 0);
const isToday = computed(() => props.day.Day === currentDay.value);
const isPast = computed(() => props.day.Day < currentDay.value);
const isFuture = computed(() => props.day.Day > currentDay.value);

const primaryMatch = computed(() => {
  if (!props.day.Matches || props.day.Matches.length === 0) return null;
  if (props.club) {
    const clubM = props.day.Matches.find(
      (m: any) => m.Home === props.club || m.Away === props.club
    );
    if (clubM) return clubM;
  }
  return props.day.Matches[0];
});

const clubMatchContext = computed(() => {
  if (!props.club || !primaryMatch.value) return null;
  if (primaryMatch.value.Home === props.club) {
    return { isHome: true, label: `Home vs ${primaryMatch.value.Away}` };
  }
  if (primaryMatch.value.Away === props.club) {
    return { isHome: false, label: `Away @ ${primaryMatch.value.Home}` };
  }
  return null;
});

const cardStyle = computed(() => {
  if (props.active) {
    return {
      border: '2px solid #6366f1',
      background: 'linear-gradient(135deg, rgba(49, 46, 129, 0.9) 0%, rgba(30, 27, 75, 0.9) 100%)',
    };
  }
  if (isToday.value) {
    return {
      border: '2px solid #22c55e',
      background: 'linear-gradient(135deg, rgba(20, 83, 45, 0.35) 0%, rgba(15, 23, 42, 0.85) 100%)',
    };
  }
  return {
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(30, 34, 53, 0.6)',
  };
});
</script>

<style scoped>
.day-card {
  transition: all 0.2s ease-in-out;
}
.day-card:hover {
  transform: translateY(-2px);
}
</style>
