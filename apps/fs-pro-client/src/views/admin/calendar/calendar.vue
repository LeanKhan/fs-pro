<template>
  <div>
    <v-card :loading="loading">
      <v-toolbar>
        <v-toolbar-title class="subtitle-1 font-weight-bold indigo--text">
          Current Calendar: {{ calendar?.YearString }}
        </v-toolbar-title>

        <v-toolbar-items>
          <v-btn
            color="warning"
            v-if="calendar?.allSeasonsCompleted"
            @click="endYear"
          >
            END YEAR
          </v-btn>
        </v-toolbar-items>
      </v-toolbar>

      <v-card-title>New Calendar...</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="6">
            <v-btn
              color="primary"
              :disabled="loading"
              :loading="loading"
              @click="createNewYear"
            >
              New Calendar Year
            </v-btn>
            <br />
            <v-checkbox
              v-model="randomMonth"
              label="Random Month"
              hint="Random Month like 'CGB'"
            ></v-checkbox>
          </v-col>
          <v-col cols="6">
            <v-input readonly :value="new Date().getFullYear()"></v-input>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>Calendars</v-card-title>

      <v-card-text>
        <ul>
          <li v-for="cndr in calendars" :key="cndr._id">
            {{ cndr.YearString }}

            <v-chip small>
              {{ cndr.isActive ? 'Active' : 'Not Active' }}
            </v-chip>

            <v-chip small v-if="cndr.isEnded">Ended</v-chip>

            <v-btn
              v-if="cndr.Days && cndr.Days.length > 0"
              text
              small
              @click="startCalendarYear(cndr.YearString, cndr._id)"
            >
              Start Year
            </v-btn>

            <v-btn
              v-else-if="!cndr.Days || cndr.Days.length == 0"
              text
              small
              class="ml-2"
              color="accent"
              @click="setupAndStartCalendarYear(cndr.YearString, cndr._id)"
            >
              Setup &amp; Start
            </v-btn>
          </li>
        </ul>
      </v-card-text>
    </v-card>

    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>

    <v-snackbar v-model="toast.show" :timeout="3000" :color="toast.color">
      {{ toast.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useStore } from '@/store';
import { $axios } from '@/main';

const store = useStore();

const loading = ref(false);
const calendars = ref<any[]>([]);
const randomMonth = ref(false);
const toast = ref({
  show: false,
  color: 'success',
  message: 'Inside Calendar!',
});

const calendar = computed(() => store.calendar) || {};

async function createNewYear() {
  loading.value = true;

  try {
    const response = await $axios.post(
      `/calendar/new${randomMonth.value ? '?override_month=true' : ''}`
    );

    toast.value = {
      show: true,
      color: 'success',
      message: 'Calendar created successfully!',
    };

    await getCalendars();
  } catch (error) {
    console.error('Error creating calendar:', error);
    toast.value = {
      show: true,
      color: 'error',
      message: 'Error creating calendar',
    };
  } finally {
    loading.value = false;
  }
}

async function getCalendars() {
  try {
    const response = await $axios.get('/calendar/calendars');
    calendars.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching calendars:', error);
  }
}

async function startCalendarYear(year: string, id: string) {
  loading.value = true;

  try {
    const response = await $axios.post(`/calendar/${year}/${id}/start`);

    toast.value = {
      show: true,
      color: 'success',
      message: 'Year started successfully!',
    };

    await store.setCalendar();
  } catch (error) {
    console.error('Error starting calendar year:', error);
    toast.value = {
      show: true,
      color: 'error',
      message: 'Error starting year',
    };
  } finally {
    loading.value = false;
  }
}

async function setupAndStartCalendarYear(year: string, id: string) {
  loading.value = true;

  try {
    const response = await $axios.post(
      `/calendar/${year}/${id}/setup-and-start`
    );

    toast.value = {
      show: true,
      color: 'success',
      message: 'Calendar Year setup & started successfully!',
    };

    await store.setCalendar();
  } catch (error) {
    console.error('Error setting up calendar year:', error);
    toast.value = {
      show: true,
      color: 'error',
      message: 'Error setting up & starting Year!',
    };
  } finally {
    loading.value = false;
  }
}

function endYear() {
  // Implementation for ending the year
  console.log('Ending year...');
}

onMounted(() => {
  getCalendars();
});
</script>
