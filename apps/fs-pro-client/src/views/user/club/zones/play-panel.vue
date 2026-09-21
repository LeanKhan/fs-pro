<template>
  <v-card class="pa-4 elevation-3 mb-4">
    <div v-if="loading && !state" class="text-center pa-4">
      <v-progress-circular indeterminate size="28"></v-progress-circular>
    </div>
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">{{ error }}</v-alert>

    <template v-else-if="state">
      <div class="d-flex justify-space-between align-center mb-2">
        <div>
          <div class="text-h6 font-weight-bold">{{ state.club.name }}</div>
          <div class="text-caption text-medium-emphasis">
            Club Level {{ state.club.level }} - {{ state.club.xpIntoLevel }} /
            {{ state.club.xpForNext }} XP
          </div>
        </div>
        <v-chip color="primary" size="small">Power {{ state.club.power }}</v-chip>
      </div>
      <v-progress-linear
        :model-value="xpPercent"
        color="amber"
        height="6"
        rounded
        class="mb-4"
      ></v-progress-linear>

      <!-- PLAY -->
      <div v-if="!readOnly" class="text-center mb-4">
        <v-btn
          size="x-large"
          color="success"
          variant="flat"
          :loading="playing"
          :disabled="cooldownLeft > 0 || playing"
          class="px-12"
          @click="play"
        >
          {{ cooldownLeft > 0 ? `Squad resting ${formatClock(cooldownLeft)}` : 'PLAY' }}
        </v-btn>
        <div class="text-caption text-medium-emphasis mt-1">
          Matchmaking picks an opponent of similar power. Wins pay cash and XP; your stadium earns
          the gate.
        </div>
      </div>

      <!-- Challenge -->
      <v-card variant="outlined" class="pa-3 mb-3">
        <div class="d-flex justify-space-between align-center">
          <div class="font-weight-bold text-body-2">Club Challenge</div>
          <v-chip size="x-small" :color="challengeLeft > 0 ? 'info' : 'error'">
            {{ challengeLeft > 0 ? formatClock(challengeLeft) : 'Expired' }}
          </v-chip>
        </div>
        <div class="text-body-2 mt-1">{{ state.challenge.title }}</div>
        <v-progress-linear
          :model-value="(state.challenge.wins / state.challenge.targetWins) * 100"
          color="success"
          height="8"
          rounded
          class="mt-2"
        ></v-progress-linear>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ state.challenge.wins }} / {{ state.challenge.targetWins }} wins -
          {{ state.challenge.matchesPlayed }} played - Reward
          {{ currency(state.challenge.rewardCash) }} + {{ state.challenge.rewardXP }} XP
        </div>
      </v-card>

      <!-- Recent -->
      <div v-if="state.recent.length" class="text-caption text-medium-emphasis mb-1">Recent matches</div>
      <div class="d-flex flex-wrap gap-2">
        <v-chip
          v-for="m in state.recent"
          :key="m.fixtureId"
          size="small"
          :color="outcomeColor(m.outcome)"
          variant="tonal"
        >
          {{ m.score }} vs {{ m.opponent }}
        </v-chip>
      </div>
    </template>

    <!-- Result -->
    <v-dialog v-model="showResult" max-width="420">
      <v-card v-if="result" class="pa-5 text-center">
        <div class="text-overline">{{ state?.club.name }} vs {{ result.opponent.name }}</div>
        <div class="text-caption text-medium-emphasis">
          Power {{ state?.club.power }} vs {{ result.opponent.power }}
        </div>
        <div class="text-h2 font-weight-bold my-3">{{ result.score.you }} - {{ result.score.them }}</div>
        <v-chip :color="outcomeColor(result.outcome)" class="mb-3">
          {{ result.outcome === 'win' ? 'VICTORY' : result.outcome === 'loss' ? 'DEFEAT' : 'DRAW' }}
        </v-chip>
        <div class="text-body-2">
          Reward: {{ currency(result.rewards.cash) }} + {{ result.rewards.xp }} XP
        </div>
        <div v-if="result.gate" class="text-body-2 text-medium-emphasis">
          Stadium: {{ result.gate.attendance.toLocaleString() }} fans - net
          {{ currency(result.gate.net) }}
        </div>
        <v-alert v-if="result.challengeCompleted" type="success" variant="tonal" density="compact" class="mt-3">
          Challenge complete!
        </v-alert>
        <v-btn class="mt-4" color="primary" variant="flat" @click="showResult = false">Continue</v-btn>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :timeout="3500" color="error">{{ snackbarText }}</v-snackbar>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { MatchResult, PlayState } from '@repo/api-contract';
import { currency } from '@/helpers/misc';
import { client } from '@/services/api';

const props = withDefaults(defineProps<{ clubId?: string | null; readOnly?: boolean }>(), {
  readOnly: false,
});
const emit = defineEmits<{ (e: 'update-available'): void }>();

const state = ref<PlayState | null>(null);
const loading = ref(false);
const error = ref('');
const playing = ref(false);
const result = ref<MatchResult | null>(null);
const showResult = ref(false);
const snackbar = ref(false);
const snackbarText = ref('');

/** Ticks every second so the cooldown / challenge countdowns run locally. */
const now = ref(Date.now());
const loadedAt = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

const elapsed = computed(() => Math.max(Math.floor((now.value - loadedAt.value) / 1000), 0));
const cooldownLeft = computed(() => Math.max((state.value?.cooldownSeconds ?? 0) - elapsed.value, 0));
const challengeLeft = computed(() => Math.max((state.value?.challenge.secondsLeft ?? 0) - elapsed.value, 0));
const xpPercent = computed(() =>
  state.value ? Math.min(100, (state.value.club.xpIntoLevel / state.value.club.xpForNext) * 100) : 0
);

function formatClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const outcomeColor = (o: string) => (o === 'win' ? 'success' : o === 'loss' ? 'error' : 'warning');

function setState(next: PlayState) {
  state.value = next;
  loadedAt.value = Date.now();
}

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await client.play.getPlayState.query({ params: { clubId: props.clubId } });
    if (res.status === 200) setState(res.body.payload);
    else error.value = res.body.message;
  } catch (err) {
    console.error('Failed to load play state:', err);
    error.value = 'Could not load the play screen.';
  } finally {
    loading.value = false;
  }
}

async function play() {
  if (!props.clubId) return;
  playing.value = true;
  try {
    const res = await client.play.playMatch.mutation({ params: { clubId: props.clubId }, body: {} });
    if (res.status === 200) {
      result.value = res.body.payload;
      setState(res.body.payload.state);
      showResult.value = true;
      emit('update-available'); // treasury and XP changed
    } else {
      snackbarText.value = res.body.message;
      snackbar.value = true;
      await load();
    }
  } catch (err) {
    console.error('Failed to play match:', err);
    snackbarText.value = 'Could not play the match.';
    snackbar.value = true;
  } finally {
    playing.value = false;
  }
}

watch(() => props.clubId, load, { immediate: true });
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onBeforeUnmount(() => timer && clearInterval(timer));
defineExpose({ reload: load });
</script>
