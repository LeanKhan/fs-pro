<template>
  <div>
    <v-card :loading="loading">
      <v-toolbar>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold text-indigo">
          Day {{ calendar?.CurrentDay }} - {{ formattedGameDate }}
        </v-toolbar-title>
      </v-toolbar>
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

    <v-overlay :model-value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>

    <v-snackbar v-model="toast.show" :timeout="3000" :color="toast.color">
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
