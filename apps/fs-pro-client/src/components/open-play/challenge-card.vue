<template>
  <v-card variant="tonal" class="challenge-card pa-3">
    <div class="d-flex align-center ga-3">
      <club-crest :code="dir.code(opponentId)" :size="36" />
      <div class="flex-grow-1 overflow-hidden">
        <div class="font-weight-bold text-truncate">
          <span class="text-medium-emphasis">{{ isHome ? 'vs' : '@' }}</span> {{ dir.name(opponentId) }}
        </div>
        <div class="text-caption text-medium-emphasis text-truncate">
          {{ challenge.competitionName ?? 'Competition' }}
          <template v-if="challenge.scheduledDay != null"> · Day {{ challenge.scheduledDay }}</template>
        </div>
      </div>
      <v-chip size="x-small" :color="STATUS_COLORS[chipStatus]" variant="flat">{{ chipStatus }}</v-chip>
    </div>
    <div v-if="challenge.status === 'proposed' && challenge.respondBy != null" class="text-caption mt-2" :class="urgent ? 'text-red-lighten-2' : 'text-medium-emphasis'">
      <v-icon size="14">mdi-timer-sand</v-icon>
      Answer by day {{ challenge.respondBy }}
      <template v-if="today != null"> ({{ daysLeft }} {{ daysLeft === 1 ? 'day' : 'days' }} left)</template>
    </div>
    <div v-if="actions.length" class="d-flex ga-2 mt-2 justify-end">
      <v-btn
        v-for="a in actions"
        :key="a.action"
        size="small"
        :color="a.color"
        :variant="a.variant"
        :loading="busy === a.action"
        :disabled="!!busy"
        @click="act(a.action)"
      >
        {{ a.label }}
      </v-btn>
    </div>
    <div v-if="challenge.played" class="d-flex justify-end mt-1">
      <v-btn size="small" variant="text" :to="`/matchzone/${challenge.id}`">Match</v-btn>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MatchChallenge } from '@repo/api-contract';
import ClubCrest from './club-crest.vue';
import { STATUS_COLORS, useClubDirectory } from '@/helpers/open-play';
import { useOpenPlayStore } from '@/store/open-play';

const props = withDefaults(defineProps<{ challenge: MatchChallenge; today?: number | null }>(), { today: null });
const emit = defineEmits<{ (e: 'done', message: string): void; (e: 'error', message: string): void }>();

const store = useOpenPlayStore();
const dir = useClubDirectory();
const busy = ref<string | null>(null);

const mine = computed(() => store.clubId);
const isHome = computed(() => props.challenge.homeClubId === mine.value);
const opponentId = computed(() => (isHome.value ? props.challenge.awayClubId : props.challenge.homeClubId));
const chipStatus = computed(() => (props.challenge.played && props.challenge.status === 'accepted' ? 'played' : (props.challenge.status ?? 'proposed')));
const daysLeft = computed(() => (props.challenge.respondBy ?? 0) - (props.today ?? 0));
const urgent = computed(() => props.today != null && daysLeft.value <= 1);

type Action = 'accept' | 'decline' | 'cancel';
const actions = computed(() => {
  if (props.challenge.status !== 'proposed') return [];
  if (props.challenge.direction === 'incoming')
    return [
      { action: 'decline' as Action, label: 'Decline', color: 'grey', variant: 'text' as const },
      { action: 'accept' as Action, label: 'Accept', color: 'teal', variant: 'flat' as const },
    ];
  return [{ action: 'cancel' as Action, label: 'Withdraw', color: 'grey', variant: 'text' as const }];
});

async function act(action: Action) {
  busy.value = action;
  try {
    const r = await store.respond(props.challenge.id, action);
    emit(
      'done',
      r.forfeited ? 'Declined too often: the match was forfeited 3-0' : action === 'accept' ? 'Challenge accepted' : action === 'decline' ? 'Challenge declined' : 'Challenge withdrawn'
    );
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err));
  } finally {
    busy.value = null;
  }
}
</script>
