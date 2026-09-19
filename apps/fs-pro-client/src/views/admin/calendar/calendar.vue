<template>
  <div>
    <v-card :loading="loading">
      <v-toolbar>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold text-indigo">
          Day {{ calendar?.CurrentDay }} - {{ formattedGameDate }}
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn
          color="indigo-lighten-2"
          variant="tonal"
          prepend-icon="mdi-calendar-multiselect"
          to="/u/calendar"
          class="mr-2"
        >
          Open Year Calendar
        </v-btn>
      </v-toolbar>
    </v-card>

    <!-- Season cycle: what to do next -->
    <v-card class="mt-3" :loading="stepLoading" border>
      <v-card-title class="d-flex align-center gap-2">
        <v-icon :color="stepColor">{{ stepIcon }}</v-icon>
        <span>Next step: {{ step?.title ?? 'Checking season cycle...' }}</span>
      </v-card-title>
      <v-card-text v-if="step">
        <p class="text-medium-emphasis mb-3">{{ step.detail }}</p>

        <v-text-field
          v-if="step.kind === 'start'"
          v-model="year"
          label="Year label for the new cycle"
          density="compact"
          hide-details
          class="mb-3"
          style="max-width: 320px"
        ></v-text-field>

        <v-btn
          :color="stepColor"
          :disabled="loading || simLoading || stepLoading || (step.kind === 'start' && !year)"
          @click="runStep"
        >
          {{ stepButtonLabel }}
        </v-btn>
        <v-btn
          variant="text"
          class="ml-2"
          :disabled="stepLoading"
          @click="refreshStep"
        >
          Refresh
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Admin Sim to Date Card -->
    <v-card class="mt-3">
      <v-card-title class="d-flex align-center gap-2">
        <v-icon color="purple-accent-3">mdi-fast-forward</v-icon>
        <span>Simulate to Date (Fast-Forward)</span>
      </v-card-title>
      <v-card-text>
        <p class="text-caption text-medium-emphasis mb-3">
          Simulates all scheduled matches across all leagues sequentially up to the target day/date using QuickSim, recovers player fitness, and advances the game world clock.
        </p>
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model.number="targetDay"
              type="number"
              label="Target Day"
              :min="(calendar?.CurrentDay ?? 1) + 1"
              hint="Game day number to advance to"
              persistent-hint
            ></v-text-field>

            <div class="d-flex gap-2 mt-2 flex-wrap">
              <v-btn size="x-small" variant="tonal" color="primary" @click="setTargetOffset(1)">
                +1 Day
              </v-btn>
              <v-btn size="x-small" variant="tonal" color="primary" @click="setTargetOffset(7)">
                +1 Week (7 Days)
              </v-btn>
              <v-btn size="x-small" variant="tonal" color="primary" @click="setTargetOffset(14)">
                +2 Weeks
              </v-btn>
              <v-btn size="x-small" variant="tonal" color="purple-accent-3" @click="setTargetOffset(30)">
                +1 Month (30 Days)
              </v-btn>
            </div>
          </v-col>

          <v-col cols="12" md="6" class="d-flex flex-column justify-center">
            <v-btn
              color="purple-accent-3"
              size="large"
              :disabled="loading || simLoading || !targetDay || targetDay <= (calendar?.CurrentDay ?? 1)"
              :loading="simLoading"
              prepend-icon="mdi-fast-forward"
              @click="simToDate"
            >
              Simulate to Day {{ targetDay || '...' }}
            </v-btn>

            <div v-if="lastSimResult" class="mt-2 text-caption text-success font-weight-bold">
              ✓ {{ lastSimResult }}
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card class="mt-3">
      <v-card-title class="d-flex align-center gap-2">
        <v-icon :color="transferWindow?.open ? 'success' : 'warning'">mdi-swap-horizontal</v-icon>
        Transfer Window
        <v-chip
          size="small"
          class="ml-2"
          :color="transferWindow?.open ? 'success' : 'warning'"
          variant="tonal"
        >
          {{ transferWindow?.open ? 'Open' : 'Closed' }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <p class="text-caption text-medium-emphasis mb-3">
          Opens automatically when a season cycle ends and closes
          {{ WINDOW_DAYS }} game days after the next one starts. While open, AI clubs bid for
          players and trade among themselves as days pass. Purchases and bids are refused when it is
          closed.
          <span v-if="transferWindow?.open && transferWindow.closesDay !== null">
            Closes on day {{ transferWindow.closesDay }} ({{ transferWindow.daysLeft }} left).
          </span>
        </p>
        <v-btn color="success" class="mr-2" :disabled="windowBusy" @click="setWindow(true, WINDOW_DAYS)">
          Open for {{ WINDOW_DAYS }} days
        </v-btn>
        <v-btn color="success" variant="tonal" class="mr-2" :disabled="windowBusy" @click="setWindow(true)">
          Open (no close)
        </v-btn>
        <v-btn color="warning" variant="tonal" :disabled="windowBusy || !transferWindow?.open" @click="setWindow(false)">
          Close now
        </v-btn>
      </v-card-text>
    </v-card>

    <v-card class="mt-3">
      <v-card-title>Start Next Season Cycle</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="6">
            <v-text-field
              v-model="year"
              label="Year label (e.g. XPY-2029)"
              hint="A free-form label for this season cycle - doesn't need to match the real-world year."
              persistent-hint
            ></v-text-field>
          </v-col>
          <v-col cols="6" class="d-flex align-center">
            <v-btn
              color="primary"
              :disabled="loading || !year"
              :loading="loading"
              @click="startNextSeasonCycle"
            >
              Start Next Season Cycle
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card class="mt-3">
      <v-card-title>End a Season Cycle</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="6">
            <v-text-field
              v-model="endYearInput"
              label="Year label to end"
              hint="Prolegates every Season in that Year cycle, once they've all finished."
              persistent-hint
            ></v-text-field>
          </v-col>
          <v-col cols="6" class="d-flex align-center">
            <v-btn color="warning" :disabled="!endYearInput" @click="goEndYear">
              End Season Cycle
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-overlay :model-value="loading || simLoading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>

    <v-snackbar v-model="toast.show" :timeout="4000" :color="toast.color">
      {{ toast.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@/store';
import { client } from '@/services/api';
import {
  computeCycleStep,
  latestCycle,
  type CycleSeason,
  type CycleStep,
  type SeasonProgress,
} from '@/utils/seasonCycle';

const store = useStore();
const router = useRouter();

const loading = ref(false);
const simLoading = ref(false);
const targetDay = ref<number | null>(null);
const lastSimResult = ref<string>('');
const year = ref('');
const endYearInput = ref('');
const toast = ref({
  show: false,
  color: 'success',
  message: '',
});

const WINDOW_DAYS = 14;
const transferWindow = ref<{
  open: boolean;
  closesDay: number | null;
  daysLeft: number | null;
} | null>(null);
const windowBusy = ref(false);

async function loadWindow() {
  try {
    const res = await client.transfers.getTransferWindow.query();
    if (res.status === 200) transferWindow.value = res.body.payload;
  } catch (error) {
    console.error('Error loading the transfer window:', error);
  }
}

async function setWindow(open: boolean, days?: number) {
  windowBusy.value = true;
  try {
    const res = await client.transfers.setTransferWindow.mutation({ body: { open, days } });
    if (res.status === 200) {
      transferWindow.value = res.body.payload;
      toast.value = { show: true, color: 'success', message: res.body.message };
    } else {
      toast.value = { show: true, color: 'error', message: res.body.message };
    }
  } catch (error) {
    console.error('Error changing the transfer window:', error);
    toast.value = { show: true, color: 'error', message: 'Could not change the transfer window' };
  } finally {
    windowBusy.value = false;
  }
}

const step = ref<CycleStep | null>(null);
const stepLoading = ref(false);

const STEP_STYLE: Record<CycleStep['kind'], { color: string; icon: string; button: string }> = {
  play: { color: 'purple-accent-3', icon: 'mdi-fast-forward', button: 'Simulate' },
  advance: { color: 'purple-accent-3', icon: 'mdi-calendar-arrow-right', button: 'Advance day' },
  finish: { color: 'green', icon: 'mdi-flag-checkered', button: 'Finish seasons' },
  end: { color: 'warning', icon: 'mdi-calendar-check', button: 'End season cycle' },
  start: { color: 'primary', icon: 'mdi-calendar-plus', button: 'Start season cycle' },
};
const stepColor = computed(() => STEP_STYLE[step.value?.kind ?? 'start'].color);
const stepIcon = computed(() => STEP_STYLE[step.value?.kind ?? 'start'].icon);
const stepButtonLabel = computed(() => {
  const current = step.value;
  if (!current) return '';
  const base = STEP_STYLE[current.kind].button;
  if (current.kind === 'play' || current.kind === 'advance') {
    return `${base} to day ${current.targetDay}`;
  }
  return current.kind === 'start' && year.value ? `${base} (${year.value})` : base;
});

const calendar = computed(() => store.calendar);
const formattedGameDate = computed(() =>
  calendar.value?.CurrentDate
    ? new Date(calendar.value.CurrentDate).toDateString()
    : ''
);

function setTargetOffset(days: number) {
  const current = calendar.value?.CurrentDay ?? 1;
  targetDay.value = current + days;
}

async function simToDate() {
  if (!targetDay.value) return;
  simLoading.value = true;
  lastSimResult.value = '';

  try {
    const res = await client.calendar.simulateToDate.mutation({
      body: { targetDay: targetDay.value },
    });

    if (res.status === 200) {
      const msg = res.body.message || 'Simulated successfully!';
      lastSimResult.value = msg;
      toast.value = {
        show: true,
        color: 'success',
        message: msg,
      };
      await store.setCalendar();
      targetDay.value = (store.calendar?.CurrentDay ?? 1) + 7;
    } else {
      toast.value = {
        show: true,
        color: 'error',
        message: res.body.message || 'Error simulating to target date',
      };
    }
  } catch (err) {
    console.error('Error simulating to date:', err);
    toast.value = {
      show: true,
      color: 'error',
      message: 'Failed to simulate to target date',
    };
  } finally {
    simLoading.value = false;
  }
}


async function startNextSeasonCycle() {
  if (!year.value) return;
  loading.value = true;

  try {
    const res = await client.calendar.startNextSeasonCycle.mutation({
      body: { Year: year.value },
    });
    if (res.status !== 200) {
      toast.value = {
        show: true,
        color: 'error',
        message: res.body.message || 'Error starting next season cycle',
      };
      return;
    }
    toast.value = {
      show: true,
      color: 'success',
      message: 'Next season cycle started successfully!',
    };
    await store.setCalendar();
    await store.setSeasons();
  } catch (error) {
    console.error('Error starting next season cycle:', error);
    toast.value = {
      show: true,
      color: 'error',
      message: 'Error starting next season cycle',
    };
  } finally {
    loading.value = false;
  }
}

function goEndYear() {
  if (!endYearInput.value) return;
  router.push(`/finish/year/${endYearInput.value}`);
}

/** Reads every season and, for the unfinished ones of the latest cycle, how
 * many fixtures are left, then works out the single next admin action. */
async function refreshStep() {
  stepLoading.value = true;
  try {
    await store.setCalendar();
    const [seasonRes, competitionRes] = await Promise.all([
      client.seasons.getSeasons.query({ query: {} }),
      client.competitions.getCompetitions.query({ query: {} }),
    ]);
    if (seasonRes.status !== 200) return;

    const typeById = new Map<string, string>();
    if (competitionRes.status === 200) {
      for (const c of competitionRes.body.payload) {
        if (c._id) typeById.set(c._id, (c.Type ?? '').toLowerCase());
      }
    }

    const seasons: CycleSeason[] = seasonRes.body.payload.map((s) => ({
      _id: s._id,
      SeasonCode: s.SeasonCode,
      CompetitionCode: s.CompetitionCode,
      Year: s.Year,
      isStarted: s.isStarted,
      isFinished: s.isFinished,
      Status: s.Status,
      createdAt: s.createdAt,
      selfFinishing: ['cup', 'tournament'].includes(
        typeById.get(s.CompetitionId ?? '') ?? ''
      ),
    }));

    const progress: Record<string, SeasonProgress> = {};
    await Promise.all(
      latestCycle(seasons)
        .filter((s) => !s.isFinished && s._id)
        .map(async (s) => {
          const res = await client.seasons.getSeason.query({ params: { id: s._id! } });
          if (res.status !== 200 || !res.body.payload) return;
          const unplayed = (res.body.payload.Fixtures ?? []).filter((f) => !f.Played);
          progress[s._id!] = {
            unplayed: unplayed.length,
            lastUnplayedDay: unplayed.length
              ? Math.max(...unplayed.map((f) => f.ScheduledDay ?? 0))
              : null,
          };
        })
    );

    step.value = computeCycleStep(seasons, progress, calendar.value?.CurrentDay ?? 1);
    if (step.value.suggestedYear && !year.value) year.value = step.value.suggestedYear;
  } catch (error) {
    console.error('Error working out the next season-cycle step:', error);
  } finally {
    stepLoading.value = false;
  }
}

async function runStep() {
  const current = step.value;
  if (!current) return;

  switch (current.kind) {
    case 'start':
      await startNextSeasonCycle();
      break;
    case 'play':
    case 'advance':
      targetDay.value = current.targetDay ?? null;
      await simToDate();
      break;
    case 'finish': {
      loading.value = true;
      try {
        for (const id of current.seasonIds ?? []) {
          const res = await client.seasons.finishSeason.mutation({ params: { id }, body: {} });
          if (res.status !== 200) {
            toast.value = { show: true, color: 'error', message: 'Could not finish a season: ' + (res.body.message ?? 'unknown error') };
            return;
          }
        }
        toast.value = { show: true, color: 'success', message: 'Seasons finished!' };
      } catch (error) {
        console.error('Error finishing seasons:', error);
        toast.value = { show: true, color: 'error', message: 'Error finishing seasons' };
      } finally {
        loading.value = false;
      }
      break;
    }
    case 'end':
      endYearInput.value = current.year ?? '';
      goEndYear();
      return;
  }
  await refreshStep();
}

onMounted(() => {
  refreshStep();
  loadWindow();
});
</script>
