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
    await client.calendar.startNextSeasonCycle.mutation({
      body: { Year: year.value },
    });
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

onMounted(() => {
  store.setCalendar();
});
</script>
