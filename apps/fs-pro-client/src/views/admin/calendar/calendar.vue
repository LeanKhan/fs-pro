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

    <world-settings-card class="mt-3" @changed="store.setCalendar()" />

    <!-- Admin Sim to Date Card -->
    <v-card class="mt-3">
      <v-card-title class="d-flex align-center gap-2">
        <v-icon color="purple-accent-3">mdi-fast-forward</v-icon>
        <span>Simulate to Date (Fast-Forward)</span>
      </v-card-title>
      <v-card-text>
        <p class="text-caption text-medium-emphasis mb-3">
          Runs every world day up to the target day: editions open and close, AI clubs enter and challenge, accepted matches are played, and the year rolls over when it ends.
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
        <v-icon :color="clock?.mode === 'live' ? 'success' : 'warning'">mdi-clock-outline</v-icon>
        Live Game Clock
        <v-chip size="small" class="ml-2" :color="clock?.mode === 'live' ? 'success' : 'warning'" variant="tonal">
          {{ clock?.mode === 'live' ? 'Live' : 'Paused' }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <p class="text-caption text-medium-emphasis mb-3">
          While live, the server runs one world day at each tick: competitions move on, challenges
          expire, AI clubs act and accepted matches are played. Days with matches last the match-day
          slot, quiet days the off-day slot. Sim-to-date above works whether the clock is live or
          paused.
          <span v-if="clock?.mode === 'live' && clock.nextTickAt">
            Next kickoff: {{ new Date(clock.nextTickAt).toLocaleString() }}.
          </span>
        </p>
        <v-row dense>
          <v-col cols="6" md="3">
            <v-text-field v-model.number="matchdayMinutes" type="number" min="1" density="compact"
              label="Match-day slot (min)" hide-details />
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field v-model.number="offDayMinutes" type="number" min="1" density="compact"
              label="Off-day slot (min)" hide-details />
          </v-col>
        </v-row>
        <div class="mt-3">
          <v-btn color="success" class="mr-2" :disabled="clockBusy" @click="updateClock({ mode: 'live', ...slots() })">
            {{ clock?.mode === 'live' ? 'Save pacing' : 'Go live' }}
          </v-btn>
          <v-btn color="warning" variant="tonal" class="mr-2" :disabled="clockBusy || clock?.mode !== 'live'"
            @click="updateClock({ mode: 'paused' })">
            Pause
          </v-btn>
          <v-btn variant="tonal" :disabled="clockBusy" @click="tickClockNow">Advance now</v-btn>
        </div>
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
          Opens automatically on the transfer-window days set in the world settings above. While open, AI clubs bid for
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
import { useStore } from '@/store';
import { client } from '@/services/api';
import WorldSettingsCard from '@/components/open-play/world-settings-card.vue';

const store = useStore();

const loading = ref(false);
const simLoading = ref(false);
const targetDay = ref<number | null>(null);
const lastSimResult = ref<string>('');
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

const clock = ref<{
  mode: 'live' | 'paused';
  nextTickAt: string | null;
  matchdaySlotMinutes: number;
  offDaySlotMinutes: number;
} | null>(null);
const clockBusy = ref(false);
const matchdayMinutes = ref(180);
const offDayMinutes = ref(10);

const slots = () => ({
  matchdaySlotMinutes: matchdayMinutes.value,
  offDaySlotMinutes: offDayMinutes.value,
});

async function loadClock() {
  try {
    const res = await client.calendar.getClock.query();
    if (res.status === 200) {
      clock.value = res.body.payload;
      matchdayMinutes.value = res.body.payload.matchdaySlotMinutes;
      offDayMinutes.value = res.body.payload.offDaySlotMinutes;
    }
  } catch (error) {
    console.error('Error loading the clock:', error);
  }
}

async function updateClock(body: {
  mode?: 'live' | 'paused';
  matchdaySlotMinutes?: number;
  offDaySlotMinutes?: number;
}) {
  clockBusy.value = true;
  try {
    const res = await client.calendar.setClock.mutation({ body });
    if (res.status === 200) {
      clock.value = res.body.payload;
      toast.value = { show: true, color: 'success', message: res.body.message };
    } else {
      toast.value = { show: true, color: 'error', message: res.body.message };
    }
  } catch (error) {
    console.error('Error updating the clock:', error);
    toast.value = { show: true, color: 'error', message: 'Could not update the clock' };
  } finally {
    clockBusy.value = false;
  }
}

async function tickClockNow() {
  clockBusy.value = true;
  try {
    const res = await client.calendar.tickClock.mutation({ body: {} });
    toast.value = {
      show: true,
      color: res.status === 200 ? 'success' : 'error',
      message: res.body.message,
    };
    await store.setCalendar();
    await loadClock();
  } catch (error) {
    console.error('Error advancing the clock:', error);
    toast.value = { show: true, color: 'error', message: 'Could not advance the day' };
  } finally {
    clockBusy.value = false;
  }
}

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


onMounted(() => {
  store.setCalendar();
  loadWindow();
  loadClock();
});
</script>
